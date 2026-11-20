import { NOOP_ } from "./runtime";

export interface ISubItem {
  subNext_: ISubItem | null;
  subPrev_: ISubItem | null;
}

export interface ISubList {
  subHead_: ISubItem | null;
  subTail_: ISubItem | null;
}

export interface ICallbackItem<L extends ICallbackList = any> extends ISubItem {
  list_: L | null;
  callback_: (value: any) => void;
  subNext_: ICallbackItem<L> | null;
  subPrev_: ICallbackItem<L> | null;
}

export interface ICallbackList<T extends ICallbackItem<any> = any> extends ISubList {
  subHead_: T | null;
  subTail_: T | null;
  next_: T | null;
  end_: T | null;
}

export interface IDepItem {
  depNext_: IDepItem | null;
}

export interface IDepList {
  depHead_: IDepItem | null;
  depTail_: IDepItem | null;
}

export function appendSub(list: ISubList, item: ISubItem): void {
  item.subPrev_ = list.subTail_;
  item.subNext_ = null;
  if (list.subTail_ !== null) {
    list.subTail_.subNext_ = item;
  } else {
    list.subHead_ = item;
  }
  list.subTail_ = item;
}

export function removeSub(list: ISubList, item: ISubItem): void {
  if (item.subPrev_ !== null) {
    item.subPrev_.subNext_ = item.subNext_;
  } else {
    list.subHead_ = item.subNext_;
  }
  if (item.subNext_ !== null) {
    item.subNext_.subPrev_ = item.subPrev_;
  } else {
    list.subTail_ = item.subPrev_;
  }
  item.subPrev_ = item.subNext_ = null;
}

export function clearSubs(list: ISubList): void {
  let item = list.subHead_;
  while (item !== null) {
    const next = item.subNext_;
    item.subPrev_ = item.subNext_ = null;
    item = next;
  }
  list.subHead_ = list.subTail_ = null;
}

export function detachCallback<L extends ICallbackList>(item: ICallbackItem<L>): L | null {
  const list = item.list_;
  if (list !== null) {
    item.list_ = null;
    // Keep a callback list's cursor/boundary valid when callbacks unsubscribe.
    if (list.next_ === item) {
      list.next_ = item.subNext_;
    }
    if (list.end_ === item) {
      list.end_ = item.subPrev_;
    }
    removeSub(list, item);
    item.callback_ = NOOP_;
    if (list.subHead_ === null) {
      return list;
    }
  }
  return null;
}

export function invokeCallbacks(list: ICallbackList, value: any): void {
  list.next_ = list.subHead_;
  list.end_ = list.subTail_;
  try {
    while (list.next_ !== null) {
      const subscription = list.next_;
      list.next_ = subscription.subNext_;
      subscription.callback_(value);
      if (subscription === list.end_) {
        break;
      }
    }
  } finally {
    list.next_ = null;
    list.end_ = null;
  }
}
