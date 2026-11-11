export interface ISubItem {
  subNext_: ISubItem | null;
  subPrev_: ISubItem | null;
}

export interface ISubList {
  subHead_: ISubItem | null;
  subTail_: ISubItem | null;
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

export function appendDep(list: IDepList, item: IDepItem): void {
  item.depNext_ = null;
  if (list.depTail_ !== null) {
    list.depTail_.depNext_ = item;
  } else {
    list.depHead_ = item;
  }
  list.depTail_ = item;
}
