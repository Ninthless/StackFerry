import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'native/macos/traffic_lights.m')
const output = path.join(root, 'native/macos/traffic-lights.dylib')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const archs = ['arm64', 'x86_64']
const args = ['-dynamiclib', '-fobjc-arc', '-framework', 'Cocoa', '-o', output, source]
for (const arch of archs) args.splice(1, 0, '-arch', arch)

try {
  execFileSync('clang', args, { stdio: 'inherit' })
} catch {
  execFileSync('clang', ['-dynamiclib', '-fobjc-arc', '-framework', 'Cocoa', '-o', output, source], {
    stdio: 'inherit',
  })
}
