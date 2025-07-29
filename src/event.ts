import { type Disposer } from "./typings";
import { invokeEach } from "./utils";

export interface Listener<T = any> {
  (data: T): void;
}

export interface EventObject<T = any> {
  /** @internal */
  multi_?: Set<Listener<T>> | null;
  /** @internal */
  single_?: Listener<T> | null;
}

export function send<T = any>(eventObject: EventObject<T>, data: T): void {
  eventObject.multi_ ? invokeEach(eventObject.multi_, data) : eventObject.single_?.(data);
}

export function size(eventObject: EventObject): number {
  return eventObject.multi_ ? eventObject.multi_.size : eventObject.single_ ? 1 : 0;
}

export function on(eventObject: EventObject, listener: Listener): Disposer {
  eventObject.single_ || eventObject.multi_
    ? (eventObject.multi_ ??= new Set<Listener>().add(eventObject.single_!)).add(listener)
    : (eventObject.single_ = listener);
  return off.bind(null, eventObject, listener);
}

export function off(eventObject: EventObject, listener: Listener): void {
  eventObject.multi_
    ? eventObject.multi_.delete(listener)
    : eventObject.single_ === listener && (eventObject.single_ = null);
}
