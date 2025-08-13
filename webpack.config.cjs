// webpack.config.cjs
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

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
  ],
  devtool: "inline-source-map",

  // IMPORTANT: Match the exact name you will reference from Form.io
  output: {
    filename: "index.bundle.js",             // <-- single, known name
    path: path.resolve(__dirname, "dist"),
    clean: true,
    publicPath: "/",                         // served from root by dev server
  },

  devServer: {
    // Serve over HTTPS so an HTTPS page can load this script (no mixed content)
    server: "https",                         // webpack-dev-server v4+ option
    host: "0.0.0.0",                         // reachable from LAN
    port: 8080,
    static: { directory: path.resolve(__dirname, "dist") },
    allowedHosts: "all",                     // allow external hostnames to request
    headers: { "Access-Control-Allow-Origin": "*" }, // relax during dev
  },
};
