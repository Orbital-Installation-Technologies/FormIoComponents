# FormIO Componenets


## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation, Running, Testing in main](#installation-running-testing-in-main)
3. [Configuration](#configuration)
4. [Updating the Package](#updating-the-package)
5. [Environment Variables](#environment-variables)
6. [Contributing](#contributing)
7. [License](#license)

---

## Prerequisites

Ensure you have the following installed:

* **Node.js** (v16.x or later)
* **npm** (v8.x or later)
* Git (to clone and push to the internal repository)

Verify your versions:

```bash
node --version
npm --version
```

---

## Installation, Running, Testing in main

1. **Clone this repository** (internally):

   ```bash
   git clone git@your-internal-git-server:your-org/FormIoComponents.git
   cd FormIoComponents
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Running**:

   ```bash
   npm run dev
   ```

---


## Updating the Package

Every update to `main` will generate a new version. For example, to go from `v0.0.28` → `v0.0.29`, follow these steps:

1. **FormIO Builder Settings**

   * Go to **Project → Settings → Custom CSS and Javascript → Custom Javascript**
   * Change the build number. Ex: `.../components.bundle.26.js` to `.../components.bundle.27.js`

2. **Formio-Renderer project**

   * In the `formio-renderer` repository, update `package.json`:

     ```json
     "formiocomponents": "github:Orbital-Installation-Technologies/FormIoComponents#v0.0.29",
     ```
   * Delete `package-lock.json` and the `node_modules` folder
   * Run `npm install`
   * Push and create a new Pull Request

---

## Environment Variables

If your hosting environment or Form.io project requires runtime parameters, add them to a `.env` (or `.env.local`) file in the consuming application. Examples:

```text
# .env
NEXT_PUBLIC_FORMIO_BASE_URL=https://yourformio.instance.internal
# Any API keys or config needed for custom scanning logic
```

* **`NEXT_PUBLIC_FORMIO_BASE_URL`**: URL of your Form.io project (if fetching forms dynamically).

---

## Contributing

> **NOTE:** This repository is internal—**do not fork**. Instead, follow this workflow:

1. **Create a new branch** off `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Develop and test locally** (e.g., `npm run build` if you produce a bundle).
3. **Commit changes**:

   ```bash
   git add .
   git commit -m "feat: add support for CODE_128 scanning"
   ```
4. **Push your branch**:

   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** against `main` in our internal Git server.

   * Link to any related issue in the ```FormIO-Project``` GitHub organization and set issue to ```In Review```.
   * Once approved and merged, a new Git tag triggers the CI/CD pipeline.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

> **Questions?**
> Reach out on our internal Slack channel (e.g., `#project-formio-integration`) or create an issue in this repo.
