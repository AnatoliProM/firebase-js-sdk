/**
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ErrorFactory } from '@firebase/util';

import { ERROR_CODES, ERROR_MAP } from './errors';

export class DBInterface {
  private readonly DB_NAME_: string;
  private readonly dbVersion_: number;
  private openDbPromise_: Promise<IDBDatabase> | null;
  protected errorFactory_: ErrorFactory<string>;
  protected TRANSACTION_READ_WRITE: IDBTransactionMode;

  constructor(dbName: string, dbVersion: number) {
    this.errorFactory_ = new ErrorFactory('messaging', 'Messaging', ERROR_MAP);
    this.DB_NAME_ = dbName;
    this.dbVersion_ = dbVersion;
    this.openDbPromise_ = null;
    this.TRANSACTION_READ_WRITE = 'readwrite';
  }

  /**
   * Get the indexedDB as a promise.
   */
  // Visible for testing
  // TODO: Make protected
  openDatabase(): Promise<IDBDatabase> {
    if (this.openDbPromise_) {
      return this.openDbPromise_;
    }

    this.openDbPromise_ = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME_, this.dbVersion_);
      request.onerror = event => {
        reject((event.target as IDBRequest).error);
      };
      request.onsuccess = event => {
        resolve((event.target as IDBRequest).result);
      };
      request.onupgradeneeded = event => {
        let db;
        try {
          db = (event.target as IDBRequest).result;
          this.onDBUpgrade(db, event);
        } catch (err) {
          // close the database as it can't be used.
          db.close();
          reject(err);
        }
      };
    });

    return this.openDbPromise_;
  }

  /**
   * Close the currently open database.
   */
  closeDatabase(): Promise<void> {
    return Promise.resolve().then(() => {
      if (this.openDbPromise_) {
        return this.openDbPromise_.then(db => {
          db.close();
          this.openDbPromise_ = null;
        });
      }
    });
  }

  /**
   * @protected
   */
  onDBUpgrade(db: IDBDatabase, event: IDBVersionChangeEvent): void {
    throw this.errorFactory_.create(ERROR_CODES.SHOULD_BE_INHERITED);
  }
}
