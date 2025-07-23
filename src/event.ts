import { type Disposer } from "./typings";
import { invokeEach } from "./utils";

export interface Listener<T = any> {
  (data: T): void;
}

export interface AddEventListener<T = any, D = any> {
  (listener: Listener<T>): Disposer;
  /** @internal */
  multi_?: Set<Listener<T>>;
  /** @internal */
  single_?: Listener<T> | null;
  /** @internal */
  data_: D;
}

export function event<T = any, D = any>(data: D): AddEventListener<T, D> {
  function addEventListener(listener: Listener<T>): Disposer {
    return on(addEventListener, listener);
  }
  addEventListener.data_ = data;
  return addEventListener;
}

export function send<T = any>(addEventListener: AddEventListener<T>, data: T): void {
  addEventListener.multi_ ? invokeEach(addEventListener.multi_, data) : addEventListener.single_?.(data);
}

export function size(addEventListener: AddEventListener): number {
  return addEventListener.multi_ ? addEventListener.multi_.size : addEventListener.single_ ? 1 : 0;
}

export function on(addEventListener: AddEventListener, listener: Listener): Disposer {
  addEventListener.single_ || addEventListener.multi_
    ? (addEventListener.multi_ ??= new Set<Listener>().add(addEventListener.single_!)).add(listener)
    : (addEventListener.single_ = listener);
  return off.bind(addEventListener, listener);
}

function off(this: AddEventListener, listener: Listener): void {
  this.multi_ ? this.multi_.delete(listener) : this.single_ === listener && (this.single_ = null);
}
