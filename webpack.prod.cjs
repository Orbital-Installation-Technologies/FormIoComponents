const path = require("path");
const webpack = require("webpack");
const Dotenv = require('dotenv-webpack');

module.exports = (env) => {
  const buildNumber = env.buildNumber || "dev"; // Default to "dev" if no build number is provided

  return {
    mode: "production",
    entry: {
      components: "./src/app-prod.js",
    },
    plugins: [
      new Dotenv(),
      new webpack.EnvironmentPlugin(["FORMIO_PREMIUM_LICENSE"]),
    ],
    output: {
      filename: `[name].bundle.${buildNumber}.js`,
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    // No runtime process polyfill needed; Define via EnvironmentPlugin at build time
  };
};
