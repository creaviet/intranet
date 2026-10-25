import { buildConfig } from 'payload';
import { mongooseAdapter } from '@payloadcms/db-mongodb';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { Users } from './src/collections/Users';
import { Posts } from './src/collections/Posts';
import { Comments } from './src/collections/Comments';
import { Reactions } from './src/collections/Reactions';
import { Notifications } from './src/collections/Notifications';
import { Pages } from './src/collections/Pages';
import { Templates } from './src/collections/Templates';
import { Follows } from './src/collections/Follows';

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'replace-this-development-secret',
  serverURL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  db: mongooseAdapter({ url: process.env.DATABASE_URI || 'mongodb://localhost:27017/intranet' }),
  editor: lexicalEditor(),
  collections: [Users, Posts, Comments, Reactions, Notifications, Pages, Templates, Follows],
  typescript: { outputFile: './src/payload-types.ts' },
  cors: [process.env.NEXTAUTH_URL || 'http://localhost:3000'],
  csrf: [process.env.NEXTAUTH_URL || 'http://localhost:3000'],
});
