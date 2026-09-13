import { NestFactory } from '@nestjs/core';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';

function buildTaggedDoc(tag: string, full: OpenAPIObject): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = {};

  for (const [path, methods] of Object.entries(full.paths ?? {})) {
    const operations = (methods ?? {}) as Record<string, unknown>;
    const includesTag = Object.values(operations).some(
      (op: any) => Array.isArray(op?.tags) && op.tags.includes(tag),
    );
    if (includesTag) {
      paths[path] = methods;
    }
  }

  return {
    ...full,
    openapi: full.openapi,
    info: { ...full.info, title: `${tag} API` },
    paths,
    tags: (full.tags ?? []).filter((t) => t.name === tag),
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : true,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Technicks Learn API')
    .setDescription('Technicks Learn API with authentication, courses, and gamification')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('courses', 'Course management')
    .addTag('admin', 'Admin and development operations')
    .addTag('health', 'Liveness and readiness')
    .addTag('learn', 'Lessons, curriculum, and progress')
    .addTag('gamification', 'XP, check-ins, streaks, and leaderboards')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const tags = new Set<string>((document.tags ?? []).map((t) => t.name));
  for (const methods of Object.values(document.paths ?? {})) {
    for (const op of Object.values(methods ?? {}) as any[]) {
      for (const tag of op?.tags ?? []) {
        tags.add(tag);
      }
    }
  }

  const docs: Record<string, OpenAPIObject> = { full: document };
  for (const tag of tags) {
    docs[tag] = buildTaggedDoc(tag, document);
  }

  const expressApp: any = app.getHttpAdapter().getInstance();
  expressApp.get('/docs/:docName.json', (req: Request, res: Response) => {
    const docName = (req.params as { docName: string }).docName;
    const doc = docs[docName];
    if (!doc) {
      return res.status(404).json({
        error: `No OpenAPI document for prefix "${docName}"`,
        available: Object.keys(docs),
      });
    }
    return res.json(doc);
  });

  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
