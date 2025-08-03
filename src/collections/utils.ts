import { type BatchTask } from "../batch";
import { on, type RemoveListener, send, size, type EventObject } from "../event";

/** When a value should be disposed */
export interface OnDisposeValue<V> extends BatchTask<EventObject<V>> {
  readonly delete_: Set<V>;
}

export function onDisposeValue<V>(
  this: { onDisposeValue_?: null | OnDisposeValue<V> },
  fn: (value: V) => void,
): RemoveListener {
  return on(
    (this.onDisposeValue_ ??= {
      delete_: new Set<V>(),
      task_: () => {
        if (this.onDisposeValue_ && size(this.onDisposeValue_)) {
          const { delete_ } = this.onDisposeValue_;
          if (delete_.size) {
            const removedValues = [...delete_];
            delete_.clear();
            for (const value of removedValues) {
              send(this.onDisposeValue_, value);
            }
          }
        } else {
          this.onDisposeValue_ = null;
        }
      },
    }),
    fn,
  );
}
