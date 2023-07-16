class Controller extends joint.mvc.Listener {

    get context() {
        const [ctx = null] = this.callbackArguments;
        return ctx;
    }

}
