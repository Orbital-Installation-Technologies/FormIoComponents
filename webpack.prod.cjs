const path = require("path");

module.exports = (env) => {
  const buildNumber = env.buildNumber || "dev"; // Default to "dev" if no build number is provided

  return {
    mode: "production",
    entry: {
      components: "./src/app-prod.js",
    },
    output: {
      filename: `[name].bundle.${buildNumber}.js`,
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    externals: {
      "@formio/js": "Formio",
      "@formio/premium": "premium",
    }
  };
};
