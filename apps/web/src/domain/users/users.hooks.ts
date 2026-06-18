import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from './users.service';
import type { InviteUserBody, UpdateUserBody } from './users.service';
import { toast } from '@/store/toast-store';

export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: () => usersService.list(),
  });

export const useJobLabels = () =>
  useQuery({
    queryKey: ['job-labels'],
    queryFn: () => usersService.jobLabels(),
  });

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteUserBody) => usersService.invite(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User invited.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to invite user.');
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      usersService.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update user.');
    },
  });
}
