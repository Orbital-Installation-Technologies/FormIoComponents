const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const Dotenv = require('dotenv-webpack');

module.exports = {
  mode: "development",
  entry: {
    index: "./src/app-dev.js",
  },
  plugins: [
    new Dotenv(),
    new webpack.DefinePlugin({
      'process': JSON.stringify({
        env: {
          //FORMIO_PREMIUM_LICENSE: process.env.FORMIO_PREMIUM_LICENSE || ''
        }
      })
    }),
    new HtmlWebpackPlugin({
      title: "output management",
      template: "./template.html",
    }),
  ],
  // No runtime process polyfill needed; DefinePlugin replaces env vars at compile time
  devtool: "inline-source-map",
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  devServer: {
    static: "./dist",
  },
};
