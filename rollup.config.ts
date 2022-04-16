import typescript from 'rollup-plugin-typescript2'
export default [
  {
    input: './src/index.ts',
    output: {
      file: './lib/index.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.json' })],
  },
  {
    input: './src/transport/node.ts',
    output: {
      file: './lib/transport/node.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.node.json' })],
    external: ['tls', '../index']
  },
  {
    input: './src/transport/universal.ts',
    output: {
      file: './lib/transport/universal.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.uni.json' })],
    external: ['../index']
  },
]