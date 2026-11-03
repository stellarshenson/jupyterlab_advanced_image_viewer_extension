// Emit the occt-import-js glue, WASM and LGPL licence texts as separate files
// beside the bundle, and the baked Studio environment. The builder's base rules
// parse a .js as a module and inline a .txt as source text, which would put all
// of them inside the bundle.
module.exports = {
  module: {
    rules: [
      {
        test: /occt-import-js\.js$/,
        type: 'asset/resource',
        generator: { filename: '[name][ext]' }
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: { filename: '[name][ext]' }
      },
      {
        test: /\.bin$/,
        type: 'asset/resource',
        generator: { filename: '[name][ext]' }
      },
      {
        test: /license\.occt(-import-js)?\.txt$/,
        type: 'asset/resource',
        generator: { filename: '[name][ext]' }
      }
    ]
  }
};
