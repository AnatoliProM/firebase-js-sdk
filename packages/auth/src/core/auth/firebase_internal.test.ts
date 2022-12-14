/**
 * @license
 * Copyright 2020 Google LLC
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

import { FirebaseError } from '@firebase/util';
import { expect, use } from 'chai';
import * as sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';

import { testAuth, testUser } from '../../../test/helpers/mock_auth';
import { AuthInternal } from '../../model/auth';
import { UserInternal } from '../../model/user';
import { AuthInterop } from './firebase_internal';

use(chaiAsPromised);

describe('core/auth/firebase_internal', () => {
  let auth: AuthInternal;
  let authInternal: AuthInterop;
  beforeEach(async () => {
    auth = await testAuth();
    authInternal = new AuthInterop(auth);
  });

  afterEach(() => {
    sinon.restore();
  });

  context('getUid', () => {
    it('returns null if currentUser is undefined', () => {
      expect(authInternal.getUid()).to.be.null;
    });

    it('returns the uid of the user if set', async () => {
      const user = testUser(auth, 'uid');
      await auth._updateCurrentUser(user);
      expect(authInternal.getUid()).to.eq('uid');
    });

    it('errors if Auth is not initialized', () => {
      delete (auth as unknown as Record<string, unknown>)[
        '_initializationPromise'
      ];
      expect(() => authInternal.getUid()).to.throw(
        FirebaseError,
        'auth/dependent-sdk-initialized-before-auth'
      );
    });
  });

  context('getToken', () => {
    it('returns null if currentUser is undefined', async () => {
      expect(await authInternal.getToken()).to.be.null;
    });

    it('returns the id token of the current user correctly', async () => {
      const user = testUser(auth, 'uid');
      await auth._updateCurrentUser(user);
      user.stsTokenManager.accessToken = 'access-token';
      user.stsTokenManager.refreshToken = 'refresh-token';
      user.stsTokenManager.expirationTime = Date.now() + 1000 * 60 * 60 * 24;
      expect(await authInternal.getToken()).to.eql({
        accessToken: 'access-token'
      });
    });

    it('errors if Auth is not initialized', async () => {
      delete (auth as unknown as Record<string, unknown>)[
        '_initializationPromise'
      ];
      await expect(authInternal.getToken()).to.be.rejectedWith(
        FirebaseError,
        'auth/dependent-sdk-initialized-before-auth'
      );
    });
  });

  context('token listeners', () => {
    let isProactiveRefresh = false;
    let user: UserInternal;

    beforeEach(async () => {
      user = testUser(auth, 'uid', undefined, true);
      await auth._updateCurrentUser(user);
      let i = 0;
      sinon.stub(user.stsTokenManager, 'getToken').callsFake(async () => {
        i += 1;
        return `new-access-token-${i}`;
      });
      sinon
        .stub(user, '_startProactiveRefresh')
        .callsFake(() => (isProactiveRefresh = true));
      sinon
        .stub(user, '_stopProactiveRefresh')
        .callsFake(() => (isProactiveRefresh = false));
    });

    context('addAuthTokenListener', () => {
      it('gets called with the token, starts proactive refresh', done => {
        // The listener always fires first time. Ignore that one
        let firstCall = true;
        authInternal.addAuthTokenListener(token => {
          if (firstCall) {
            firstCall = false;
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            user.getIdToken(true);
            return;
          }

          expect(token).to.eq('access-token');
          expect(isProactiveRefresh).to.be.true;
          done();
        });
      });

      it('gets called on subsequent updates', async () => {
        let tokenCount = 0;
        authInternal.addAuthTokenListener(() => {
          tokenCount++;
        });

        await user.getIdToken(true);
        await user.getIdToken(true);
        await user.getIdToken(true);
        await user.getIdToken(true);

        expect(tokenCount).to.eq(5);
      });

      it('errors if Auth is not initialized', () => {
        delete (auth as unknown as Record<string, unknown>)[
          '_initializationPromise'
        ];
        expect(() => authInternal.addAuthTokenListener(() => {})).to.throw(
          FirebaseError,
          'auth/dependent-sdk-initialized-before-auth'
        );
      });
    });

    context('removeAuthTokenListener', () => {
      it('listeners no longer receive token updates', async () => {
        let tokenCount = 0;
        function listener(): void {
          tokenCount++;
        }
        authInternal.addAuthTokenListener(listener);

        await user.getIdToken(true);
        expect(tokenCount).to.eq(2);
        authInternal.removeAuthTokenListener(listener);
        await user.getIdToken(true);
        await user.getIdToken(true);
        await user.getIdToken(true);
        expect(tokenCount).to.eq(2);
      });

      it('toggles proactive refresh when listeners fall to 0', () => {
        function listenerA(): void {}

        authInternal.addAuthTokenListener(listenerA);
        expect(isProactiveRefresh).to.be.true;
        authInternal.removeAuthTokenListener(listenerA);
        expect(isProactiveRefresh).to.be.false;
      });

      it('toggles proactive refresh when single listener subbed twice', () => {
        function listenerA(): void {}

        authInternal.addAuthTokenListener(listenerA);
        authInternal.addAuthTokenListener(listenerA);
        expect(isProactiveRefresh).to.be.true;
        authInternal.removeAuthTokenListener(listenerA);
        expect(isProactiveRefresh).to.be.false;
      });

      it('toggles proactive refresh properly multiple listeners', () => {
        function listenerA(): void {}
        function listenerB(): void {}

        authInternal.addAuthTokenListener(listenerA);
        authInternal.addAuthTokenListener(listenerB);
        expect(isProactiveRefresh).to.be.true;
        authInternal.removeAuthTokenListener(listenerA);
        expect(isProactiveRefresh).to.be.true;
        authInternal.removeAuthTokenListener(listenerB);
        expect(isProactiveRefresh).to.be.false;

        authInternal.addAuthTokenListener(listenerB);
        expect(isProactiveRefresh).to.be.true;
      });

      it('errors if Auth is not initialized', () => {
        delete (auth as unknown as Record<string, unknown>)[
          '_initializationPromise'
        ];
        expect(() => authInternal.removeAuthTokenListener(() => {})).to.throw(
          FirebaseError,
          'auth/dependent-sdk-initialized-before-auth'
        );
      });
    });
  });
});
