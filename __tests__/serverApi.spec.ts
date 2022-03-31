import * as amogus from "../lib/index.esm";
import * as api from "./globalMethod_output/ts/index";

describe("Nice server API", () => {
    const { client, server } = amogus.transport.universal.createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = new amogus.Server(server, { suffix: "!" });

    serverSession.onInvocation("echo", async (method, state) => {
        const params = method.params;
        await method.return({ str: params.str + state.suffix });
        return { suffix: state.suffix + "!" };
    });

    test("State preservation", async () => {
        expect(await clientSession.echo({ str: "Hello" })).toEqual({ str: "Hello!" });
        expect(await clientSession.echo({ str: "Hello" })).toEqual({ str: "Hello!!" });
        expect(await clientSession.echo({ str: "Hello" })).toEqual({ str: "Hello!!!" });
    });
});
