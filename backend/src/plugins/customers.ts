import type { Express } from 'express';
import type { Plugin } from '../types';
import { customersRouter } from '../services/customers/routes';

export const customersPlugin: Plugin = {
  name: 'customers',
  version: '1.0.0',
  description: '顧客管理（CRM基盤）',
  label: '顧客管理',
  icon: '👥',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/customers', customersRouter);
  },
};
