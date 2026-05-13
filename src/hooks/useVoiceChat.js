import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * useVoiceChat — peer-to-peer voice chat for a watch-party room.
 *
 * Architecture: full mesh of RTCPeerConnections. Supabase Realtime is used
 * purely as the signalling channel (offers / answers / ICE candidates). Once
 * peers have exchanged ICE, audio flows directly between browsers (with a
 * STUN-discovered public IP). No TURN, so very restrictive corporate networks
 * may fail to connect — fine for a casual watch-party use-case.
 *
 * Suitable for ≤8 simultaneous voice users; mesh fan-out becomes the
 * bottleneck after that.
 *
 * Public API:
 *   joinVoice() / leaveVoice()
 *   toggleMute()                — local mic on/off
 *   forceMutePeer(userId)       — host-only "soft" mute (cooperative)
 *   joined                      — am I currently in voice?
 *   muted                       — am I muted?
 *   peers                       — Map<userId, { speaking, muted }>
 */
export function useVoiceChat({ roomId, user, isHost }) {
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  // peers state used purely for UI (speaking dots, mute icons). The actual
  // RTCPeerConnection objects live in the ref to avoid stale-closure issues.
  const [peers, setPeers] = useState(() => new Map())

  const channelRef = useRef(null)
  const localStreamRef = useRef(null)
  // userId -> { pc, audioEl, analyser, rafId }
  const peersRef = useRef(new Map())
  // userId -> [pending ICE candidates received before remote SDP was set]
  const iceQueueRef = useRef(new Map())

  const userId = user?.id || null

  /* ---------- helpers ---------- */

  const updatePeerState = useCallback((id, patch) => {
    setPeers((prev) => {
      const next = new Map(prev)
      const cur = next.get(id) || { speaking: false, muted: false }
      next.set(id, { ...cur, ...patch })
      return next
    })
  }, [])

  const removePeerState = useCallback((id) => {
    setPeers((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Send a signalling message via the room's voice channel.
  const send = useCallback((event, payload) => {
    const ch = channelRef.current
    if (!ch) return
    return ch.send({ type: 'broadcast', event, payload: { ...payload, from: userId } })
  }, [userId])

  /* ---------- peer-connection lifecycle ---------- */

  const buildPeer = useCallback((peerId, isInitiator) => {
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId).pc

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.playsInline = true
    // Keep the element off-screen but in the DOM so iOS Safari permits
    // audio playback after the user gesture that triggered joinVoice().
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)

    // Add local audio tracks.
    const local = localStreamRef.current
    if (local) {
      for (const track of local.getAudioTracks()) {
        pc.addTrack(track, local)
      }
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track])
      audioEl.srcObject = stream
      // Hook up a poor-man's voice-activity detector for the speaking dot.
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        let lastSpeakState = false
        const tick = () => {
          analyser.getByteFrequencyData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) sum += data[i]
          const speaking = sum / data.length > 8 // threshold tuned by ear
          if (speaking !== lastSpeakState) {
            lastSpeakState = speaking
            updatePeerState(peerId, { speaking })
          }
          const entry = peersRef.current.get(peerId)
          if (entry) entry.rafId = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        /* analyser is best-effort */
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send('voice:ice', { to: peerId, candidate: e.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId)
      }
    }

    peersRef.current.set(peerId, { pc, audioEl })
    updatePeerState(peerId, { speaking: false, muted: false })

    if (isInitiator) {
      ;(async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          send('voice:offer', { to: peerId, sdp: pc.localDescription })
        } catch (err) {
          console.warn('[voice] offer failed', err)
        }
      })()
    }

    return pc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, updatePeerState])

  const cleanupPeer = useCallback((peerId) => {
    const entry = peersRef.current.get(peerId)
    if (!entry) return
    try { entry.pc.close() } catch { /* */ }
    try { entry.audioEl?.remove() } catch { /* */ }
    if (entry.rafId) cancelAnimationFrame(entry.rafId)
    peersRef.current.delete(peerId)
    iceQueueRef.current.delete(peerId)
    removePeerState(peerId)
  }, [removePeerState])

  /* ---------- public actions ---------- */

  const joinVoice = useCallback(async () => {
    if (joined || !userId) return
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err) {
      console.warn('[voice] mic permission denied', err)
      throw err
    }
    localStreamRef.current = stream
    setMuted(false)
    setJoined(true)
    // Announce so other voice members start an offer to us.
    send('voice:join', {})
  }, [joined, userId, send])

  const leaveVoice = useCallback(() => {
    // Close all peers
    for (const id of Array.from(peersRef.current.keys())) cleanupPeer(id)
    // Stop local mic
    const local = localStreamRef.current
    if (local) for (const t of local.getTracks()) try { t.stop() } catch { /* */ }
    localStreamRef.current = null
    setJoined(false)
    setMuted(false)
    send('voice:leave', {})
  }, [cleanupPeer, send])

  const toggleMute = useCallback(() => {
    const local = localStreamRef.current
    if (!local) return
    const next = !muted
    for (const t of local.getAudioTracks()) t.enabled = !next
    setMuted(next)
    send('voice:muteState', { muted: next })
  }, [muted, send])

  // Cooperative force-mute: ask a target to mute themselves.
  const forceMutePeer = useCallback((targetId) => {
    if (!isHost) return
    send('voice:forceMute', { to: targetId })
  }, [isHost, send])

  /* ---------- signalling channel ---------- */

  useEffect(() => {
    if (!roomId || !userId) return
    const ch = supabase.channel(`voice-${roomId}`, {
      config: { broadcast: { self: false } },
    })

    ch.on('broadcast', { event: 'voice:join' }, ({ payload }) => {
      if (!joined || !payload?.from || payload.from === userId) return
      // Tie-break: the higher-id peer initiates the offer to avoid
      // glare (both sides creating offers simultaneously).
      const initiator = userId > payload.from
      buildPeer(payload.from, initiator)
    })

    ch.on('broadcast', { event: 'voice:leave' }, ({ payload }) => {
      if (!payload?.from) return
      cleanupPeer(payload.from)
    })

    ch.on('broadcast', { event: 'voice:offer' }, async ({ payload }) => {
      if (!joined) return
      if (payload?.to !== userId) return
      const pc = buildPeer(payload.from, false)
      try {
        await pc.setRemoteDescription(payload.sdp)
        // Drain any ICE that arrived before the SDP.
        const queued = iceQueueRef.current.get(payload.from) || []
        for (const c of queued) {
          try { await pc.addIceCandidate(c) } catch { /* */ }
        }
        iceQueueRef.current.delete(payload.from)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        send('voice:answer', { to: payload.from, sdp: pc.localDescription })
      } catch (err) {
        console.warn('[voice] handle offer failed', err)
      }
    })

    ch.on('broadcast', { event: 'voice:answer' }, async ({ payload }) => {
      if (payload?.to !== userId) return
      const entry = peersRef.current.get(payload.from)
      if (!entry) return
      try {
        await entry.pc.setRemoteDescription(payload.sdp)
        const queued = iceQueueRef.current.get(payload.from) || []
        for (const c of queued) {
          try { await entry.pc.addIceCandidate(c) } catch { /* */ }
        }
        iceQueueRef.current.delete(payload.from)
      } catch (err) {
        console.warn('[voice] handle answer failed', err)
      }
    })

    ch.on('broadcast', { event: 'voice:ice' }, async ({ payload }) => {
      if (payload?.to !== userId) return
      const entry = peersRef.current.get(payload.from)
      if (!entry || !entry.pc.remoteDescription) {
        // Queue until SDP is set.
        const list = iceQueueRef.current.get(payload.from) || []
        list.push(payload.candidate)
        iceQueueRef.current.set(payload.from, list)
        return
      }
      try { await entry.pc.addIceCandidate(payload.candidate) } catch { /* */ }
    })

    ch.on('broadcast', { event: 'voice:muteState' }, ({ payload }) => {
      if (!payload?.from) return
      updatePeerState(payload.from, { muted: !!payload.muted })
    })

    ch.on('broadcast', { event: 'voice:forceMute' }, ({ payload }) => {
      // Soft mute — cooperative. If the target is us, mute ourselves.
      if (payload?.to !== userId) return
      const local = localStreamRef.current
      if (!local || muted) return
      for (const t of local.getAudioTracks()) t.enabled = false
      setMuted(true)
      send('voice:muteState', { muted: true })
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && joined) {
        // (Re-)announce ourselves so existing voice members initiate to us.
        ch.send({ type: 'broadcast', event: 'voice:join', payload: { from: userId } })
      }
    })
    channelRef.current = ch
    return () => {
      try { supabase.removeChannel(ch) } catch { /* */ }
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, joined])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const id of Array.from(peersRef.current.keys())) cleanupPeer(id)
      const local = localStreamRef.current
      if (local) for (const t of local.getTracks()) try { t.stop() } catch { /* */ }
      localStreamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    joined,
    muted,
    peers,
    joinVoice,
    leaveVoice,
    toggleMute,
    forceMutePeer,
  }
}
