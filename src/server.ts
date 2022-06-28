// The nice server-side API

import { NotNull } from "./common";
import { FieldArray } from "./repr";
import { InvocationEvent, Session as SessionType } from "./session";
import { SpecSpace, AllMethods } from "./things";

// Extracts the method spec from a spec space by its name
type MethodByName<M extends AllMethods<SpecSpace>, N extends M["spec"]["name"]> =
    Extract<M, { spec: { name: N } }>;

// Wraps a Session providing a nicer API on the server side
export class Server<State extends object, Session extends SessionType> {
    debug: boolean;

    private session: Session;
    private state: State;
    // rate limiter state
    private limiter: {
        [_ in AllMethods<Session["specSpace"]>["spec"]["name"]]?:
        number[]
    } = {};

    constructor(session: Session, initialState: State, debug?: boolean) {
        this.session = session;
        this.state = initialState;
        this.debug = debug ?? false;

        this.log("created", {});

        // debug events
        this.session.subscribe((e) => {
            if(e.type === "method_invocation")
                this.log(`method_invocation: ${e.method.spec.name}`, e.method.params);
            else if(e.type === "close")
                this.log("close");
        });
    }

    // Logs a message if `debug` is true
    private log(tag: string, data?: object|string) {
        if(!this.debug)
            return;

        console.log(`[server event: ${tag}]`);
        console.log("state =", this.state);
        if(data)
            console.log("data =", data);
        console.log();
    }

    // Registers a method callback
    onInvocation<M extends AllMethods<Session["specSpace"]>, N extends M["spec"]["name"]>(
        name: N,
        callback: (method: NotNull<MethodByName<M, N>, "params">, state: State) => Promise<State|void|undefined>|State|void|undefined
    ) {
        this.session.subscribe(async (ev) => {
            if(!(ev instanceof InvocationEvent))
                return;
            const method = ev.method as NotNull<MethodByName<M, N>, "params">;
            if(method.spec.name !== name)
                return;

            // check rate limit
            if(method.spec.rateLimit) {
                const [invocations, window] = method.spec.rateLimit;
                if(name in this.limiter) {
                    // rate-limited this method before
                    const duringCurWindow = this.limiter[name]!.filter(x => Date.now() - x <= window);

                    if(duringCurWindow.length >= invocations) {
                        this.log("limit_exceeded", { window, invocations });
                        await method.error(65533, "rate limit exceeded");
                        this.limiter[name] = duringCurWindow;
                        return;
                    }

                    duringCurWindow.push(Date.now());
                    this.limiter[name] = duringCurWindow;
                } else {
                    // first time rate-limiting this method
                    this.limiter[name] = [Date.now()];
                }
            }

            // check validity
            const error = new FieldArray(method.spec.params).findError(method.params!);
            if(error) {
                this.log("validation_failed", { error });
                await method.error(65534, error);
                return;
            }

            // save new state
            const newState = await callback(method, this.state);
            if(newState !== undefined) {
                this.log("state_updated", newState);
                this.state = newState;
            }
        });
    }

    // Registers a link destruction callback
    onClose(callback: (state: State) => void) {
        this.session.subscribe((e) => {
            if(e.type === "close")
                callback(this.state);
        });
    }
}