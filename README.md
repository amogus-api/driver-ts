<img align="right" width="128" src="https://github.com/speedapi/info/blob/master/logos/logo_color.png?raw=true">

![License](https://img.shields.io/github/license/speedapi/driver-ts)
![Version](https://img.shields.io/npm/v/@speedapi/driver)
![Coverage](https://coveralls.io/repos/github/speedapi/driver-ts/badge.svg?branch=master)
![Downloads](https://img.shields.io/npm/dt/@speedapi/driver)
![Size](https://img.shields.io/bundlephobia/minzip/@speedapi/driver)
![PRs and issues](https://img.shields.io/badge/PRs%20and%20issues-welcome-brightgreen)

# SpeedAPI wire protocol implementation
This library provides a SpeedAPI implementation for JS and TS in all major environments (browser, node, etc.). Install it with:
```console
npm i @speedapi/driver
```

Also install a transport level library according to your environment:
  - `npm i @speedapi/node` for Node.JS
  - don't see an appropriate transport here? [implement your own](#implementing-a-transport-layer)

You don't need additional libraries if you just use the `Serializer` class.

**If you're using a BigInt polyfill**, add this as close to entry as possible:
```typescript
import * as speedapi from "@speedapi/driver";

// if using a polyfill that provides a BigInt(string, radix) constructor
// (e.g. 'big-integer', 'bigint-polyfill'):
speedapi.repr.BigInteger.polyfillMode = "radix";

// if using a polyfill that supports BigInt("0x<data>"):
speedapi.repr.BigInteger.polyfillMode = "0x";

// if not using a polyfill or using a polyfill that implements
// operators like native BigInts do (haven't seen one of those
// in the wild):
speedapi.repr.BigInteger.polyfillMode = "none";
// OR don't do anything, this is the default value
```

# What is SpeedAPI?
It's a platform-agnostic API and serialization tool specifically geared towards high-throughput realtime applications. You can read more about its features [here](https://github.com/speedapi/info)

# How do I use it?
There's a complete tutorial over [here](https://github.com/speedapi/info/tree/master/speedapi-tutorial).

## Implementing a transport layer
You just have to write glue code between an implementation of your desired transport protocol and SpeedAPI. The requirements for the underlying protocol are as follows:
  - for datagram/packet/frame-based protocols like UDP: reliable and unordered - packets _must not_ get lost, but their order _may_ be mixed up (note that UDP doesn't fit this description as it's unreliable)
  - for stream-based protocols like TCP: reliable and ordered - bytes _must not_ get lost and their order _must not_ get mixed up

You will need to write 3 or 4 classes depending on the protocol nature:
  - A `Link`, `Client` and `Server` if the protocol is two-partied in nature, meaning there are only two active devices on the bus/network (e.g. UART)
  - A `Link`, `Client`, `Server` and `Listener` if one server can serve multiple clients (the overwhelming majority of Internet protocols)

Note that for every client-to-server link there's a `Client` object on the client and a `Server` object on the server. There's only one `Listener` on the server.

### `Link`
This class acts as the reader/writer for SpeedAPI and should extend `Duplex`. Its only job is to read and write `Uint8Array`s. This class will be instantiated by you, therefore you can make the constructor of an arbitrary signature. Here's the skeleton for such a class:
```ts
import { Duplex } from "@speedapi/driver";
class MyLink extends Duplex {
    constructor(/* pass what you need (e.g. a socket) */) { }
    async write(data: Uint8Array): Promise<void> { }
    async flush(): Promise<void> { } // called once the segment has finished writing
    async read(cnt: number): Promise<Uint8Array> { }
    async close(): Promise<void> { }
}
```

Alternatively, you can extend from `BufferedLink` in either of those situations:
  - The underlying protocol is datagram-based and unordered. Sending a datagram per `write` call is okay only as long as ordering is not broken. In other cases, you _must_ send the full segment in one go using `BufferedLink`.
  - The underlying protocol implementation is event-driven, meaning it provides a "data has arrived" callback, but not a "read me N bytes" function.

```ts
import { BufferedLink } from "@speedapi/driver/transport/universal";
class MyLink extends BufferedLink {
    constructor(/* again, pass what you need */) {
        someProtocol.on("bytesArrived", (data: Uint8Array) => {
            // feed BufferedLink data as it arrives
            this.dataArrived(data);
        });
    }

    // provides entire segments
    protected async dataWrite(data: Uint8Array): Promise<void> { }
    override async close(): Promise<void> { }
}
```

### `Server` and `Client`
Very thin wrappers that tell SpeedAPI about your `Link` while preserving type information.

**Important**: if you omit type information (e.g. if you're using plain JS to implement these two classes), your IDE will not be able to provide suggestions.
```ts
import { SpecSpaceGen, Session } from "@speedapi/driver";
class MyClient<Gen extends SpecSpaceGen> extends Session<Gen> {
    constructor(specSpace: Gen /* any other arguments */) {
        super(specSpace, new MyLink(/* your arguments */), "client");
    }
}
class MyServer<Gen extends SpecSpaceGen> extends Session<Gen> {
    constructor(specSpace: Gen /* any other arguments */) {
        super(specSpace, new MyLink(/* your arguments */), "server");
    }
}
```

### `Listener` (optional)
The notice from before applies here as well.
```ts
class MyListener<Gen extends SpecSpaceGen> {
    constructor(specSpace: Gen, /* any other arguments */, callback: (server: MyServer<Gen>) => void /* optional too */) {
        someProtocol.on("clientConnected", (socket) => {
            const session = new MyServer(specSpace, socket /* or any other arguments per your definition */);
            callback(session);
        });
    }

    async close() { }
}
```

# Testing
**Warning**: this repository uses a `pnpm` lock file, hence you can't substitute it for `npm` below.
```
git clone https://github.com/speedapi/driver-ts
cd driver-ts
pnpm i
pip3 install susc
pnpm test
```

# TypeScript notice
This project relies _heavily_ on typing. As such, the language server gets misled into thinking that an expression type is `any` even though it's not just because the type is deeply nested. If you see a type error in your IDE that you think shouldn't be there or you're missing some autocomplete entries, try restarting your IDE and/or language server.
