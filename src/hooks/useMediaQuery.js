import { useEffect, useState } from 'react'

/**
 * Returns true when the given CSS media query matches.
 * SSR-safe: returns false on the first render when window is undefined.
 */
export function useMediaQuery(query) {
  const get = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches

  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
