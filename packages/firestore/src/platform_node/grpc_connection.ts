/**
 * @license
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

import * as grpc from 'grpc';

import firebase from '@firebase/app';
const SDK_VERSION = firebase.SDK_VERSION;

const grpcVersion = require('grpc/package.json').version;

import { Token } from '../api/credentials';
import { DatabaseInfo } from '../core/database_info';
import { Connection, Stream } from '../remote/connection';
import { mapCodeFromRpcCode } from '../remote/rpc_error';
import { StreamBridge } from '../remote/stream_bridge';
import { assert } from '../util/assert';
import { FirestoreError } from '../util/error';
import * as log from '../util/log';
import { NodeCallback, nodePromise } from '../util/node_api';
import { Deferred } from '../util/promise';

const LOG_TAG = 'Connection';

// TODO(b/38203344): The SDK_VERSION is set independently from Firebase because
// we are doing out-of-band releases. Once we release as part of Firebase, we
// should use the Firebase version instead.
const X_GOOG_API_CLIENT_VALUE = `gl-node/${
  process.versions.node
} fire/${SDK_VERSION} grpc/${grpcVersion}`;

function createMetadata(
  databaseInfo: DatabaseInfo,
  token: Token | null
): grpc.Metadata {
  assert(
    token === null || token.type === 'OAuth',
    'If provided, token must be OAuth'
  );

  const metadata = new grpc.Metadata();
  if (token) {
    for (const header in token.authHeaders) {
      if (token.authHeaders.hasOwnProperty(header)) {
        metadata.set(header, token.authHeaders[header]);
      }
    }
  }
  metadata.set('x-goog-api-client', X_GOOG_API_CLIENT_VALUE);
  // This header is used to improve routing and project isolation by the
  // backend.
  metadata.set(
    'google-cloud-resource-prefix',
    `projects/${databaseInfo.databaseId.projectId}/` +
      `databases/${databaseInfo.databaseId.database}`
  );
  return metadata;
}

// The type of these stubs is dynamically generated by the GRPC runtime
// from the protocol buffer.
// tslint:disable-next-line:no-any
type GeneratedGrpcStub = any;

/**
 * A Connection implemented by GRPC-Node.
 */
export class GrpcConnection implements Connection {
  // tslint:disable-next-line:no-any
  private firestore: any;

  // We cache stubs for the most-recently-used token.
  private cachedStub: GeneratedGrpcStub | null = null;

  constructor(protos: grpc.GrpcObject, private databaseInfo: DatabaseInfo) {
    this.firestore = protos['google']['firestore']['v1'];
  }

  private ensureActiveStub(): GeneratedGrpcStub {
    if (!this.cachedStub) {
      log.debug(LOG_TAG, 'Creating Firestore stub.');
      const credentials = this.databaseInfo.ssl
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();
      this.cachedStub = new this.firestore.Firestore(
        this.databaseInfo.host,
        credentials
      );
    }
    return this.cachedStub;
  }

  invokeRPC<Req, Resp>(
    rpcName: string,
    request: Req,
    token: Token | null
  ): Promise<Resp> {
    const stub = this.ensureActiveStub();
    const metadata = createMetadata(this.databaseInfo, token);

    return nodePromise((callback: NodeCallback<Resp>) => {
      log.debug(LOG_TAG, `RPC '${rpcName}' invoked with request:`, request);
      return stub[rpcName](
        request,
        metadata,
        (grpcError?: grpc.ServiceError, value?: Resp) => {
          if (grpcError) {
            log.debug(
              LOG_TAG,
              `RPC '${rpcName}' failed with error:`,
              grpcError
            );
            callback(
              new FirestoreError(
                mapCodeFromRpcCode(grpcError.code),
                grpcError.message
              )
            );
          } else {
            log.debug(
              LOG_TAG,
              `RPC '${rpcName}' completed with response:`,
              value
            );
            callback(undefined, value);
          }
        }
      );
    });
  }

  invokeStreamingRPC<Req, Resp>(
    rpcName: string,
    request: Req,
    token: Token | null
  ): Promise<Resp[]> {
    const results: Resp[] = [];
    const responseDeferred = new Deferred<Resp[]>();

    log.debug(
      LOG_TAG,
      `RPC '${rpcName}' invoked (streaming) with request:`,
      request
    );
    const stub = this.ensureActiveStub();
    const metadata = createMetadata(this.databaseInfo, token);
    const stream = stub[rpcName](request, metadata);
    stream.on('data', (response: Resp) => {
      log.debug(LOG_TAG, `RPC ${rpcName} received result:`, response);
      results.push(response);
    });
    stream.on('end', () => {
      log.debug(LOG_TAG, `RPC '${rpcName}' completed.`);
      responseDeferred.resolve(results);
    });
    stream.on('error', (grpcError: grpc.ServiceError) => {
      log.debug(LOG_TAG, `RPC '${rpcName}' failed with error:`, grpcError);
      const code = mapCodeFromRpcCode(grpcError.code);
      responseDeferred.reject(new FirestoreError(code, grpcError.message));
    });

    return responseDeferred.promise;
  }

  // TODO(mikelehen): This "method" is a monster. Should be refactored.
  openStream<Req, Resp>(
    rpcName: string,
    token: Token | null
  ): Stream<Req, Resp> {
    const stub = this.ensureActiveStub();
    const metadata = createMetadata(this.databaseInfo, token);
    const grpcStream = stub[rpcName](metadata);

    let closed = false;
    let close: (err?: FirestoreError) => void;

    const stream = new StreamBridge<Req, Resp>({
      sendFn: (msg: Req) => {
        if (!closed) {
          log.debug(LOG_TAG, 'GRPC stream sending:', msg);
          try {
            grpcStream.write(msg);
          } catch (e) {
            // This probably means we didn't conform to the proto.  Make sure to
            // log the message we sent.
            log.error('Failure sending:', msg);
            log.error('Error:', e);
            throw e;
          }
        } else {
          log.debug(LOG_TAG, 'Not sending because gRPC stream is closed:', msg);
        }
      },
      closeFn: () => {
        log.debug(LOG_TAG, 'GRPC stream closed locally via close().');
        close();
      }
    });

    close = (err?: FirestoreError) => {
      if (!closed) {
        closed = true;
        stream.callOnClose(err);
        grpcStream.end();
      }
    };

    grpcStream.on('data', (msg: Resp) => {
      if (!closed) {
        log.debug(LOG_TAG, 'GRPC stream received:', msg);
        stream.callOnMessage(msg);
      }
    });

    grpcStream.on('end', () => {
      log.debug(LOG_TAG, 'GRPC stream ended.');
      close();
    });

    grpcStream.on('error', (grpcError: grpc.ServiceError) => {
      log.debug(
        LOG_TAG,
        'GRPC stream error. Code:',
        grpcError.code,
        'Message:',
        grpcError.message
      );
      const code = mapCodeFromRpcCode(grpcError.code);
      close(new FirestoreError(code, grpcError.message));
    });

    log.debug(LOG_TAG, 'Opening GRPC stream');
    // TODO(dimond): Since grpc has no explicit open status (or does it?) we
    // simulate an onOpen in the next loop after the stream had it's listeners
    // registered
    setTimeout(() => {
      stream.callOnOpen();
    }, 0);

    return stream;
  }
}
