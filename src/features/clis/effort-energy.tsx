import { useEffect, useRef, useState, type CSSProperties } from "react"

import { BLUR, COMPOSITE, ENERGY_SIMULATION, VERTEX } from "@/features/clis/effort-energy-shaders"
import { cn } from "@/lib/utils"

export const EFFORT_EMBER_PAD = {
  left: 0,
  right: 14,
  y: 0,
} as const

// 画布比轨道更宽，u_ratio 必须按轨道宽度映射，否则火尾会对不齐滑块。
export function paddedEnergyRatio(
  progress: number,
  canvasWidth: number,
  pad: { left: number; right: number } = EFFORT_EMBER_PAD,
): number {
  const track = canvasWidth - pad.left - pad.right
  if (canvasWidth <= 0 || track <= 0) return progress
  return (pad.left + progress * track) / canvasWidth
}

type Props = {
  active: boolean
  baseColor: string
  color: string
  intensity: number
  light: boolean
  ratio: number
}

type Target = {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
}

function hexRgb(value: string): number[] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  return match ? [1, 2, 3].map((index) => Number.parseInt(match[index] ?? "00", 16) / 255) : [0.61, 0.51, 1]
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind)
  if (!shader) throw new Error("Shader compilation failed")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed")
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext, source: string): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, source)
  const program = gl.createProgram()
  if (!program) throw new Error("Shader link failed")
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, "a_position")
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed")
  }
  return program
}

export function EffortEnergy({ active, baseColor, color, intensity, light, ratio }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [generation, setGeneration] = useState(0)
  const values = useRef({ active, color, intensity, light, ratio })
  const wakeRef = useRef<() => void>(() => {})
  useEffect(() => {
    values.current = { active, color, intensity, light, ratio }
    wakeRef.current()
  }, [active, color, intensity, light, ratio])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = frameRef.current
    const gl = canvas?.getContext("webgl2", {
      preserveDrawingBuffer: false,
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
    })
    if (canvas === null || gl === null || gl === undefined) return undefined
    const simulation = createProgram(gl, ENERGY_SIMULATION)
    const blur = createProgram(gl, BLUR)
    const composite = createProgram(gl, COMPOSITE)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    if (!vao || !buffer) return undefined
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name)
    const sim = {
      previous: uniform(simulation, "u_previous"),
      time: uniform(simulation, "u_time"),
      ratio: uniform(simulation, "u_ratio"),
      intensity: uniform(simulation, "u_intensity"),
      elapsed: uniform(simulation, "u_elapsed"),
      cssWidth: uniform(simulation, "u_css_width"),
      light: uniform(simulation, "u_light"),
      color: uniform(simulation, "u_color"),
    }
    const locations = {
      blurTexture: uniform(blur, "u_texture"),
      blurResolution: uniform(blur, "u_resolution"),
      blurDirection: uniform(blur, "u_direction"),
      blurRadius: uniform(blur, "u_radius"),
      blurRejectDim: uniform(blur, "u_rejectDim"),
      compositeScene: uniform(composite, "u_scene"),
      compositeBloom: uniform(composite, "u_bloom"),
      compositeLight: uniform(composite, "u_light"),
    }
    let targets: Target[] = []
    let frame = 0
    let inactive = 0
    let running = true
    let previousActive = false
    let previousRatio = values.current.ratio
    let activatedAt = performance.now()
    const destroyTargets = (): void => {
      for (const { framebuffer, texture } of targets) {
        gl.deleteFramebuffer(framebuffer)
        gl.deleteTexture(texture)
      }
      targets = []
    }
    const makeTarget = (width: number, height: number): Target => {
      const framebuffer = gl.createFramebuffer()
      const texture = gl.createTexture()
      if (!framebuffer || !texture) throw new Error("Framebuffer allocation failed")
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      return { framebuffer, texture }
    }
    const resize = (): boolean => {
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      if (cssWidth < 1 || cssHeight < 1) return false
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(cssWidth * dpr))
      const height = Math.max(1, Math.round(cssHeight * dpr))
      if (canvas.width === width && canvas.height === height && targets.length > 0) return true
      canvas.width = width
      canvas.height = height
      destroyTargets()
      targets = [makeTarget(width, height), makeTarget(width, height), makeTarget(width, height), makeTarget(width, height)]
      for (const { framebuffer } of targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return true
    }
    const clearSimulation = (): void => {
      for (const { framebuffer } of targets.slice(0, 2)) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
    }
    const draw = (now: number): void => {
      if (!running) return
      if (!resize()) {
        inactive += 1
        if (inactive < 150) frame = requestAnimationFrame(draw)
        else running = false
        return
      }
      const state = values.current
      const effectActive = state.active
      const ratioChanged = Math.abs(state.ratio - previousRatio) > 0.0005
      if (state.ratio > 0 && ratioChanged) activatedAt = now
      if (effectActive && !previousActive) {
        activatedAt = now
        clearSimulation()
      }
      previousActive = effectActive
      previousRatio = state.ratio
      if (state.ratio > 0) inactive = 0
      else inactive += 1
      const [back, scene, blurX, blurY] = targets
      if (!back || !scene || !blurX || !blurY) return
      const [red, green, blue] = hexRgb(state.color)
      const time = now / 1000
      const elapsed = state.ratio > 0 ? (now - activatedAt) / 1000 : -1
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindVertexArray(vao)
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer)
      gl.useProgram(simulation)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, back.texture)
      gl.uniform1i(sim.previous, 0)
      gl.uniform1f(sim.time, time)
      gl.uniform1f(sim.ratio, paddedEnergyRatio(state.ratio, canvas.clientWidth))
      gl.uniform1f(sim.intensity, state.intensity)
      gl.uniform1f(sim.elapsed, elapsed)
      gl.uniform1f(sim.cssWidth, canvas.clientWidth)
      gl.uniform1f(sim.light, state.light ? 1 : 0)
      gl.uniform3f(sim.color, red ?? 0.61, green ?? 0.51, blue ?? 1)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.useProgram(blur)
      gl.uniform2f(locations.blurResolution, canvas.width, canvas.height)
      gl.uniform1f(locations.blurRadius, 1.8)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, scene.texture)
      gl.uniform1i(locations.blurTexture, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurX.framebuffer)
      gl.uniform2f(locations.blurDirection, 1, 0)
      gl.uniform1f(locations.blurRejectDim, state.light ? 0 : 1)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurY.framebuffer)
      gl.bindTexture(gl.TEXTURE_2D, blurX.texture)
      gl.uniform2f(locations.blurDirection, 0, 1)
      gl.uniform1f(locations.blurRejectDim, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(composite)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, scene.texture)
      gl.uniform1i(locations.compositeScene, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, blurY.texture)
      gl.uniform1i(locations.compositeBloom, 1)
      gl.uniform1f(locations.compositeLight, state.light ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      targets[0] = scene
      targets[1] = back
      if (inactive < 150) frame = requestAnimationFrame(draw)
      else running = false
    }
    const restart = (): void => {
      if (!running) {
        running = true
        inactive = 0
        frame = requestAnimationFrame(draw)
      }
    }
    const onContextLost = (event: Event): void => {
      event.preventDefault()
      running = false
      cancelAnimationFrame(frame)
    }
    const onContextRestored = (): void => setGeneration((value) => value + 1)
    wakeRef.current = restart
    const observer = new ResizeObserver(() => {
      resize()
      restart()
    })
    observer.observe(host ?? canvas)
    canvas.addEventListener("webglcontextlost", onContextLost)
    canvas.addEventListener("webglcontextrestored", onContextRestored)
    resize()
    frame = requestAnimationFrame(draw)
    return () => {
      running = false
      wakeRef.current = () => {}
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", onContextRestored)
      if (!gl.isContextLost()) {
        destroyTargets()
        gl.deleteProgram(simulation)
        gl.deleteProgram(blur)
        gl.deleteProgram(composite)
        gl.deleteVertexArray(vao)
        gl.deleteBuffer(buffer)
      }
    }
  }, [generation])

  // canvas 是替换元素，inset 拉不开宽高；外层普通盒子负责伸出轨道，画布只填满盒子。
  return (
    <div
      ref={frameRef}
      className="effort-energy overflow-hidden rounded-[10px]"
      aria-hidden="true"
      style={
        {
          top: -EFFORT_EMBER_PAD.y,
          right: -EFFORT_EMBER_PAD.right,
          bottom: -EFFORT_EMBER_PAD.y,
          left: -EFFORT_EMBER_PAD.left,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        className={cn("block size-full", light ? "mix-blend-normal" : "mix-blend-screen")}
        data-base-color={baseColor}
      />
    </div>
  )
}
