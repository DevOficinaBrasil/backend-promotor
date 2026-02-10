import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const validateSchema = (schemas: {
  body?: z.ZodSchema<any>;
  params?: z.ZodSchema<any>;
  query?: z.ZodSchema<any>;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      
      // Validar query sem modificar o req original
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        (req as any).validatedQuery = parsedQuery;
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid input data',
          details: error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    }
  };
};