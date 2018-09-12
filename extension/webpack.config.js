const path = require('path')
const webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin')

function config(name, argv) {
  const conf = {
    name: name,
    entry: {
      content: './src/content.js',
      options: './src/options.js',
      background: './src/background.js'
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, `dist-${name}`)
    },
    plugins: [
      new webpack.DefinePlugin({
        BROWSER: JSON.stringify(name),
        NATIVE_APPLICATION_ID: JSON.stringify('com.shemanaev.memberry'),
      }),
      new CleanWebpackPlugin([`dist-${name}`]),
      new CopyWebpackPlugin([
        { from: `./manifests/${name}.json`, to: 'manifest.json' },
        { from: './assets', to: 'assets' },
        { from: './_locales', to: '_locales' },
        { from: './src/options.html', to: 'options.html' },
      ])
    ]
  }

  if (argv.mode === 'development') {
    conf.devtool = 'inline-cheap-source-map'
  }

  // if (argv.mode === 'production') {
  //   conf.devtool = 'source-map'
  // }

  return conf
}

module.exports = (env, argv) => {
  const chrome = config('chrome', argv)
  const ff = config('firefox', argv)

  return [chrome, ff]
}
