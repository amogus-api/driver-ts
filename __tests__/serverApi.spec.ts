import * as amogus from "../src/index";
import * as api from "./entity_output/ts/index";

describe("Nice server API", () => {
    const { client, server } = amogus.transport.universal.createDummyPair<ReturnType<typeof api.$specSpace>>(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = new amogus.Server(server, { suffix: "!" });

    serverSession.onInvocation("Test.static_echo", async (method, state) => {
        const params = method.params;
        await method.return({ str: params.str + state.suffix });
        return { suffix: state.suffix + "!" };
    });

    test("State preservation", async () => {
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!" });
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!!" });
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!!!" });
    });
});
