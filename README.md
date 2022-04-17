<p align="center"><img src="https://github.com/amogus-api/info/raw/master/logos/logo_color_on_white.png" height="128"/></p>

![License](https://img.shields.io/github/license/amogus-api/driver-ts)
![Version](https://img.shields.io/npm/v/amogus-driver)
![Coverage](https://coveralls.io/repos/github/amogus-api/driver-ts/badge.svg?branch=master)
![Downloads](https://img.shields.io/npm/dm/amogus-driver)
![PRs and issues](https://img.shields.io/badge/PRs%20and%20issues-welcome-brightgreen)

# AMOGUS wire protocol implementation
This library provides an AMOGUS implementation for JS and TS in all major environments (browser, node, etc.). Install it with:
```console
npm i amogus-driver
```
**If you're using a BigInt polyfill**, add this as close to the entry as possible:
```typescript
import * as amogus from "amogus-driver";

// if using a polyfill that provides a BigInt(string, radix) constructor
// (e.g. 'big-integer', 'bigint-polyfill'):
amogus.repr.BigInteger.polyfillMode = "radix";

// if using a polyfill that supports BigInt("0x<data>"):
amogus.repr.BigInteger.polyfillMode = "0x";

// if not using a polyfill or using a polyfill that implements
// operators like native BigInts (haven't seen one of those in
// the wild):
amogus.repr.BigInteger.polyfillMode = "none";
// OR don't do anything, this is the default value
```

# How do I use it??
There's a complete tutorial over [here](https://github.com/amogus-api/info/tree/master/amogus-tutorial).

# Testing
**Warning**: this repository uses a `pnpm` lock file, hence you can't substitute it for `npm` below.
```
git clone https://github.com/amogus-api/driver-ts
cd driver-ts
pnpm i
pip3 install susc
pnpm test
```
