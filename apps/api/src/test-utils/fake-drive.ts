import { GoogleDriveError, type DriveClient, type DriveConnection } from '../services/google-drive';

export interface FakeDriveItem {
  id: string;
  name: string;
  kind: 'folder' | 'pdf';
  parents: string[];
  trashed: boolean;
  content?: Uint8Array;
}

/** テスト用の Googleドライブ。実際の API と同じく、ゴミ箱の親フォルダの中身もゴミ箱扱いにする。 */
export class FakeDrive implements DriveClient {
  readonly rootFolderId = 'root-folder';
  readonly items = new Map<string, FakeDriveItem>();
  readonly shares: { id: string; email: string }[] = [];
  failWith: GoogleDriveError | null = null;
  private sequence = 0;

  constructor() {
    this.items.set(this.rootFolderId, { id: this.rootFolderId, name: '保存先', kind: 'folder', parents: [], trashed: false });
  }

  connection(): DriveConnection {
    return { client: this, rootFolderId: this.rootFolderId };
  }

  /** 同時実行のテストで処理が交互に進むよう、毎回いったん譲る。 */
  private async step() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.failWith) throw this.failWith;
  }

  private isTrashed(item: FakeDriveItem): boolean {
    if (item.trashed) return true;
    return item.parents.some((parentId) => {
      const parent = this.items.get(parentId);
      return parent ? this.isTrashed(parent) : false;
    });
  }

  /** ゴミ箱にないものだけを、親フォルダと種類で絞って返す。 */
  live(parentId: string, kind?: FakeDriveItem['kind']) {
    return [...this.items.values()].filter((item) => (
      item.parents.includes(parentId) && !this.isTrashed(item) && (!kind || item.kind === kind)
    ));
  }

  private add(name: string, kind: FakeDriveItem['kind'], parentId: string, content?: Uint8Array) {
    if (!this.items.has(parentId)) throw new GoogleDriveError('create', 404, 'notFound');
    this.sequence += 1;
    const id = `${kind}-${this.sequence}`;
    this.items.set(id, { id, name, kind, parents: [parentId], trashed: false, ...(content ? { content } : {}) });
    return id;
  }

  async get(id: string) {
    await this.step();
    const item = this.items.get(id);
    return item ? { id: item.id, name: item.name, parents: [...item.parents], trashed: this.isTrashed(item) } : null;
  }

  async createFolder(name: string, parentId: string) {
    await this.step();
    return this.add(name, 'folder', parentId);
  }

  async update(id: string, changes: { name?: string; moveTo?: string; moveFrom?: string[] }) {
    await this.step();
    const item = this.items.get(id);
    if (!item) throw new GoogleDriveError('update', 404, 'notFound');
    if (changes.name !== undefined) item.name = changes.name;
    if (changes.moveTo) {
      item.parents = [...item.parents.filter((parentId) => !changes.moveFrom?.includes(parentId)), changes.moveTo];
    }
  }

  async shareAsReader(id: string, email: string) {
    await this.step();
    this.shares.push({ id, email });
  }

  async createPdf(name: string, parentId: string, pdf: Uint8Array) {
    await this.step();
    return this.add(name, 'pdf', parentId, pdf);
  }

  async replacePdf(id: string, name: string, pdf: Uint8Array) {
    await this.step();
    const item = this.items.get(id);
    if (!item) return false;
    item.name = name;
    item.content = pdf;
    item.trashed = false;
    return true;
  }

  async trash(id: string) {
    await this.step();
    const item = this.items.get(id);
    if (item) item.trashed = true;
  }
}
