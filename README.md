## Developing Locally

### PreRequisites
#### NodeJS 20
This is configured to run with NodeJS 20+. Using nvm is recommended to easily switch between Node versions.

If you already have nvm installed. Simply type the following in terminal

```bash
#this will recognize the version set in .nvmrc file
nvm use
```
If you don't have nvm installed, follow the instructions here. If you see an error about needing to first install 20, try the following
```bash
nvm i 20 && nvm use
```

### Install Dependencies

```bash
npm install
```

### Running Development Environment

```bash
webpack serve --open
```

##  Deploying to Production

Any changes to the `main` branch will automatically be deployed to https://form-cdn.orbitalcustoms.com/components/components.bundle.[buildnumber].js

After the build is complete, update Form.IO:
* Navigate to Settings
* Custom CSS JS
* Update the current Custom JS CDN url to reflect the new build number.

Bump the tag by 1.
