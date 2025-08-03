import { type BatchTask } from "./batch";
import { invokeEach } from "./utils";

export type Listener<T = any> = (data: T) => void;

/**
 * Unsubscribes the bound listener.
 * @returns Returns true if the listener existed and has been removed,
 *          or false if the listener does not exist.
 */
export type RemoveListener = () => boolean;

export interface EventObject<T = any> {
  /** @internal */
  multi_?: Set<Listener<T>> | null;
  /** @internal */
  single_?: Listener<T> | null;
}

/** When a value should be disposed */
export interface OnDisposeValue<V> extends BatchTask<EventObject<V>> {
  readonly delete_: Set<V>;
}

export const send = <T = any>(eventObject: EventObject<T>, data: T): void =>
  eventObject.multi_ ? invokeEach(eventObject.multi_, data) : eventObject.single_?.(data);

export const size = (eventObject: EventObject): number =>
  eventObject.multi_ ? eventObject.multi_.size : eventObject.single_ ? 1 : 0;

export const on = (eventObject: EventObject, listener: Listener): RemoveListener => (
  eventObject.multi_ || eventObject.single_
    ? (eventObject.single_ = void (eventObject.multi_ ??= new Set<Listener>().add(eventObject.single_!)).add(listener))
    : (eventObject.single_ = listener),
  () => off(eventObject, listener)
);

export const off = (eventObject: EventObject, listener: Listener): boolean =>
  eventObject.multi_
    ? eventObject.multi_.delete(listener)
    : eventObject.single_ === listener && !(eventObject.single_ = null);
