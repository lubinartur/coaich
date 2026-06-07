/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dexie, { Table } from 'dexie';
import { Workout, UserProfile } from './types';

export class CoAIchDatabase extends Dexie {
  workouts!: Table<Workout>;
  profile!: Table<UserProfile>;

  constructor() {
    super('CoAIchDB');
    this.version(1).stores({
      workouts: '++id, date, name',
      profile: '++id'
    });
  }
}

export const db = new CoAIchDatabase();
