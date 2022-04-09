// The nice server-side API

import { NotNull } from "./common";
import { FieldArray } from "./repr";
import { InvocationEvent, Session as SessionType } from "./session";
import { SpecSpace, AllMethods } from "./things";

type MethodByName<M extends AllMethods<SpecSpace>, N extends M["spec"]["name"]> =
    Extract<M, { spec: { name: N } }>;

export class Server<State, Session extends SessionType<SpecSpace>> {
    private session: Session;
    private state: State;

    constructor(session: Session, initialState: State) {
        this.session = session;
        this.state = initialState;
    }

    onInvocation<M extends AllMethods<Session["specSpace"]>, N extends M["spec"]["name"]>(
        name: N,
        callback: (method: NotNull<MethodByName<M, N>, "params">, state: State) => Promise<State|void|undefined>
    ) {
        this.session.subscribe(async (ev) => {
            if(!(ev instanceof InvocationEvent))
                return;
            const method = ev.method as M;
            if(method.spec.name !== name)
                return;
            if(!method.params)
                return;

            // check validity
            if(!new FieldArray(method.spec.params).validate(method.params)) {
                await method.error(65534, "validation failed");
                return;
            }

            // @ts-expect-error params is guaranteed to be not null
            const newState = await callback(method, this.state);
            if(newState !== undefined)
                this.state = newState;
        });
    }
}