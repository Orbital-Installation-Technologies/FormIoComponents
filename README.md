## Developing Locally

### PreRequisites
#### NodeJS 18
This is configured to run with NodeJS 18.16+. Using nvm is recommended to easily switch between Node versions.

If you already have nvm installed. Simply type the following in terminal

```bash
#this will recognize the version set in .nvmrc file
nvm use
```
If you don't have nvm installed, follow the instructions here. If you see an error about needing to first install 18, try the following
```bash
nvm i 20 && nvm use
```

## Install Dependencies

```bash
npm install
```

## Running Development Environment

```bash
webpack serve --open
```
