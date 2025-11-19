const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config();

module.exports = {
  mode: "development",
  entry: {
    index: "./src/app-dev.js",
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "output management",
      template: "./template.html",
    }),
    new webpack.DefinePlugin({
      "process.env.NEXT_PUBLIC_SCANDIT_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_SCANDIT_KEY || ""
      ),
    }),
  ],
  devtool: "inline-source-map",
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  devServer: {
    static: "./dist",
    server: "https",
    host: "0.0.0.0",
    port: 8080,
  },
};
