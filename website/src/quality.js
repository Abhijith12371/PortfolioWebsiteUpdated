// Picks a starting quality tier from the GPU, so integrated graphics start light.
// ?q=low or ?q=high in the URL overrides the guess.
export function guessQuality() {
  try {
    const forced = new URLSearchParams(location.search).get('q')
    if (forced === 'low' || forced === 'high') return forced
    if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return 'low'
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
    if (!gl) return 'low'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (/Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i.test(gpu)) return 'low'
    return 'high'
  } catch {
    return 'low'
  }
}
