import * as speedapi from "../src/index";
import { createDummyPair } from "../src/transport/universal";
import * as api from "./entity_output/ts/index";

describe("Performance testing", () => {
    const { client, server } = createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = new speedapi.Server(server, { });

    jest.setTimeout(10000);

    serverSession.onInvocation("global_echo", async (method, _) => {
        await method.return(method.params);
    });
    serverSession.onInvocation("Test.static_echo", async (method, _) => {
        await method.return(method.params);
    });

    async function run(name: string, cb: () => Promise<any>) {
        const start = Date.now();
        let count = 0;

        while(Date.now() - start < 2500) {
            await cb();
            count++;
        }

        const interval = Date.now() - start;
        const speed = count / (interval / 1000);
        console.log(`Invoked ${name}() ${count} times in ${interval}ms (${speed}/s)`);
    }

    test("global method", async () => {
        await run("echo", () => clientSession.globalEcho({ str: "hello" }));
    });

    test("static method", async () => {
        await run("Test.echo", () => clientSession.Test.staticEcho({ str: "hello" }));
    });
});
