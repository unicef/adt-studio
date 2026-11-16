import { createBookHostApp } from "./book-host-app.js"

/**
 * A book host does not export `PublicationRoom`. The class lives in the control plane and book
 * hosts reach it through a `script_name` binding, because the Workers Free plan caps Durable
 * Object classes and Workers at 100 each — a class per book would exhaust both at once.
 */
export default createBookHostApp()
