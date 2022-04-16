import typescript from 'rollup-plugin-typescript2'

export default [
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.json' })],
  },
  {
    input: './src/transport/node.ts',
    output: {
      file: './transport/node.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.node.json' })],
    external: ['tls', '../index']
  },
  {
    input: './src/transport/universal.ts',
    output: {
      file: './transport/universal.js',
      format: 'cjs'
    },
    plugins: [typescript({ tsconfig: './cfg/buildconfig.uni.json' })],
    external: ['../index']
  },
]
