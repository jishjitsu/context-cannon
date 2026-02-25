const path = require('path');

module.exports = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs'
  },
  // 🔥 THE FIX: Tell Webpack to completely ignore these imports during the build
  externals: {
    'vscode': 'commonjs vscode',
    'onnxruntime-node': 'commonjs onnxruntime-node',
    'sharp': 'commonjs sharp',
    'web-tree-sitter': 'commonjs web-tree-sitter' 
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
        'onnxruntime-node': false,
        'sharp': false
    },
    // Add the exact fallback from the web-tree-sitter docs
    fallback: {
      fs: false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  devtool: 'nosources-source-map'
};