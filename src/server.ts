// The nice server-side API

import { InvocationEvent, Session as SessionType } from "./session";
import { SpecSpace, AllMethods } from "./things";

export class Server<State, Session extends SessionType<SpecSpace>> {
    private session: Session;
    private state: State;

    constructor(session: Session, initialState: State) {
        this.session = session;
        this.state = initialState;
    }

    onInvocation<M extends AllMethods<Session["specSpace"]>>(
        ...args: M extends any ? [
            M["spec"]["name"],
            (method: M, state: State) => Promise<State|undefined>
        ] : never
    ) {
        const [name, callback] = args;

        this.session.subscribe(async (ev) => {
            if(!(ev instanceof InvocationEvent))
                return;
            const method = ev.method as M;
            if(method.spec.name !== name)
                return;

            const newState = await callback(method, this.state);
            if(newState !== undefined)
                this.state = newState;
        });
    }
}