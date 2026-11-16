import { Response } from '../../features/responses/models/response.model';

export function mapResponseToDto(response: Response): Record<string, unknown> {
  return structuredClone(response) as unknown as Record<string, unknown>;
}

export function mapDtoToResponse(dto: Record<string, unknown>): Response {
  return dto as unknown as Response;
}
