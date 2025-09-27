import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

import { api } from "../trpc";
import { useBookmarkGridContext } from "./bookmark-grid-context";
import { useAddBookmarkToList } from "./lists";

type DeleteBookmarkMutation = ReturnType<
  typeof api.bookmarks.deleteBookmark.useMutation
>;
type DeleteBookmarkVariables = Parameters<DeleteBookmarkMutation["mutate"]>[0];
type DeleteBookmarkOptions = Parameters<DeleteBookmarkMutation["mutate"]>[1];
type DeleteBookmarkResult = Awaited<
  ReturnType<DeleteBookmarkMutation["mutateAsync"]>
>;

interface DeleteQueueItem {
  variables: DeleteBookmarkVariables;
  options?: DeleteBookmarkOptions;
  resolve?: (value: DeleteBookmarkResult) => void;
  reject?: (error: unknown) => void;
  dedupeKey?: string;
}

interface DeleteQueueState {
  size: number;
  isProcessing: boolean;
}

interface DeleteQueueDropContext {
  variables: DeleteBookmarkVariables;
  state: DeleteQueueState;
}

export interface DeleteQueueConfig {
  dedupeByBookmarkId?: boolean;
  maxQueueSize?: number;
  onQueueOverflow?: (context: DeleteQueueDropContext) => void;
  onDuplicate?: (context: DeleteQueueDropContext) => void;
}

type DeleteBookmarkOnError = NonNullable<DeleteBookmarkOptions["onError"]>;

function triggerDeleteOnError(
  options: DeleteBookmarkOptions | undefined,
  error: Error,
  variables: DeleteBookmarkVariables,
) {
  options?.onError?.(
    error as Parameters<DeleteBookmarkOnError>[0],
    variables,
    undefined as Parameters<DeleteBookmarkOnError>[2],
  );
}

const deleteQueueListeners = new Set<(state: DeleteQueueState) => void>();
let deleteQueue: DeleteQueueItem[] = [];
let deleteQueueProcessing = false;
let deleteQueueProcessor:
  | ((
      variables: DeleteBookmarkVariables,
      options?: DeleteBookmarkOptions,
    ) => Promise<DeleteBookmarkResult>)
  | null = null;
let currentDeleteQueueState: DeleteQueueState = {
  size: 0,
  isProcessing: false,
};
let currentProcessingDedupeKey: string | undefined;

type EnqueueResult = { enqueued: true } | { enqueued: false; error: Error };

function getDeleteQueueState(): DeleteQueueState {
  return currentDeleteQueueState;
}

function emitDeleteQueueState() {
  const nextState: DeleteQueueState = {
    size: deleteQueue.length,
    isProcessing: deleteQueueProcessing,
  };

  if (
    nextState.size === currentDeleteQueueState.size &&
    nextState.isProcessing === currentDeleteQueueState.isProcessing
  ) {
    return;
  }

  currentDeleteQueueState = nextState;
  deleteQueueListeners.forEach((listener) => listener(currentDeleteQueueState));
}

function subscribeToDeleteQueue(listener: (state: DeleteQueueState) => void) {
  deleteQueueListeners.add(listener);
  return () => deleteQueueListeners.delete(listener);
}

function processDeleteQueue() {
  if (deleteQueueProcessing) {
    return;
  }

  if (!deleteQueueProcessor) {
    return;
  }

  const nextItem = deleteQueue.shift();
  if (!nextItem) {
    currentProcessingDedupeKey = undefined;
    emitDeleteQueueState();
    return;
  }

  currentProcessingDedupeKey = nextItem.dedupeKey;
  deleteQueueProcessing = true;
  emitDeleteQueueState();

  deleteQueueProcessor(nextItem.variables, nextItem.options)
    .then((result) => {
      nextItem.resolve?.(result);
    })
    .catch((error) => {
      nextItem.reject?.(error);
    })
    .finally(() => {
      currentProcessingDedupeKey = undefined;
      deleteQueueProcessing = false;
      emitDeleteQueueState();
      if (deleteQueue.length > 0) {
        Promise.resolve().then(() => {
          processDeleteQueue();
        });
      }
    });
}

function enqueueDeleteTask(
  task: DeleteQueueItem,
  config?: DeleteQueueConfig,
): EnqueueResult {
  const currentState: DeleteQueueState = {
    size: deleteQueue.length,
    isProcessing: deleteQueueProcessing,
  };

  let dedupeKey: string | undefined;
  if (config?.dedupeByBookmarkId) {
    const bookmarkId = (task.variables as { bookmarkId?: string }).bookmarkId;
    if (typeof bookmarkId === "string" && bookmarkId.trim().length > 0) {
      dedupeKey = bookmarkId;
    }
  }

  if (dedupeKey) {
    const duplicateExists =
      currentProcessingDedupeKey === dedupeKey ||
      deleteQueue.some((item) => item.dedupeKey === dedupeKey);
    if (duplicateExists) {
      const error = new Error(
        "A delete request for this bookmark is already queued.",
      );
      config?.onDuplicate?.({ variables: task.variables, state: currentState });
      return { enqueued: false, error };
    }
    task.dedupeKey = dedupeKey;
  }

  if (typeof config?.maxQueueSize === "number" && config.maxQueueSize > 0) {
    const totalInFlight = deleteQueue.length + (deleteQueueProcessing ? 1 : 0);
    if (totalInFlight >= config.maxQueueSize) {
      const error = new Error(
        `Reached the delete queue limit of ${config.maxQueueSize} item(s).`,
      );
      config?.onQueueOverflow?.({
        variables: task.variables,
        state: currentState,
      });
      return { enqueued: false, error };
    }
  }

  deleteQueue.push(task);
  emitDeleteQueueState();
  if (!deleteQueueProcessing) {
    processDeleteQueue();
  }

  return { enqueued: true };
}

export function useAutoRefreshingBookmarkQuery(
  input: Parameters<typeof api.bookmarks.getBookmark.useQuery>[0],
) {
  return api.bookmarks.getBookmark.useQuery(input, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return false;
      }
      return getBookmarkRefreshInterval(data);
    },
  });
}

export function useCreateBookmark(
  ...opts: Parameters<typeof api.bookmarks.createBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.createBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useCreateBookmarkWithPostHook(
  ...opts: Parameters<typeof api.bookmarks.createBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  const postCreationCB = useBookmarkPostCreationHook();
  return api.bookmarks.createBookmark.useMutation({
    ...opts[0],
    onSuccess: async (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      await postCreationCB(res.id);
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

type DeleteBookmarkMutationOptions = Parameters<
  typeof api.bookmarks.deleteBookmark.useMutation
>[0];

export function useDeleteBookmark(
  mutationOptions?: DeleteBookmarkMutationOptions,
  queueConfig?: DeleteQueueConfig,
) {
  const apiUtils = api.useUtils();
  const queueConfigRef = useRef<DeleteQueueConfig | undefined>(queueConfig);
  const pendingInvalidationsRef = useRef(false);
  const mutationOptionsRef = useRef<DeleteBookmarkMutationOptions | undefined>(
    mutationOptions,
  );

  useEffect(() => {
    queueConfigRef.current = queueConfig;
  }, [queueConfig]);

  useEffect(() => {
    mutationOptionsRef.current = mutationOptions;
  }, [mutationOptions]);

  const mutation = api.bookmarks.deleteBookmark.useMutation({
    ...mutationOptions,
    onSuccess: (res, req, meta) => {
      pendingInvalidationsRef.current = true;
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      return mutationOptions?.onSuccess?.(res, req, meta);
    },
    onError: (error, req, meta) => {
      mutationOptions?.onError?.(error, req, meta);
    },
  });

  const queueState = useSyncExternalStore(
    subscribeToDeleteQueue,
    getDeleteQueueState,
    getDeleteQueueState,
  );

  useEffect(() => {
    deleteQueueProcessor = (variables, options) =>
      mutation.mutateAsync(variables, options);
    if (deleteQueue.length > 0 && !deleteQueueProcessing) {
      processDeleteQueue();
    }

    return () => {
      if (deleteQueue.length === 0) {
        deleteQueueProcessor = null;
      }
    };
  }, [mutation.mutateAsync]);

  useEffect(() => {
    if (
      !queueState.isProcessing &&
      queueState.size === 0 &&
      pendingInvalidationsRef.current
    ) {
      pendingInvalidationsRef.current = false;
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.lists.stats.invalidate();
    }
  }, [queueState.isProcessing, queueState.size, apiUtils]);

  const mutateQueued = useCallback(
    (variables: DeleteBookmarkVariables, options?: DeleteBookmarkOptions) => {
      const result = enqueueDeleteTask(
        { variables, options },
        queueConfigRef.current,
      );

      if (!result.enqueued) {
        triggerDeleteOnError(options, result.error, variables);
        triggerDeleteOnError(
          mutationOptionsRef.current as DeleteBookmarkOptions | undefined,
          result.error,
          variables,
        );
      }
    },
    [],
  );

  const mutateAsyncQueued = useCallback(
    (variables: DeleteBookmarkVariables, options?: DeleteBookmarkOptions) =>
      new Promise<DeleteBookmarkResult>((resolve, reject) => {
        const result = enqueueDeleteTask(
          { variables, options, resolve, reject },
          queueConfigRef.current,
        );
        if (!result.enqueued) {
          triggerDeleteOnError(options, result.error, variables);
          triggerDeleteOnError(
            mutationOptionsRef.current as DeleteBookmarkOptions | undefined,
            result.error,
            variables,
          );
          reject(result.error);
        }
      }),
    [],
  );

  return {
    ...mutation,
    mutate: mutateQueued,
    mutateAsync: mutateAsyncQueued,
    isPending:
      mutation.isPending || queueState.isProcessing || queueState.size > 0,
    isQueueProcessing: queueState.isProcessing,
    queuedDeletes: queueState.size,
  };
}

export function useUpdateBookmark(
  ...opts: Parameters<typeof api.bookmarks.updateBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.updateBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useSummarizeBookmark(
  ...opts: Parameters<typeof api.bookmarks.summarizeBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.summarizeBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmarks.invalidate();
      apiUtils.bookmarks.searchBookmarks.invalidate();
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useRecrawlBookmark(
  ...opts: Parameters<typeof api.bookmarks.recrawlBookmark.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.recrawlBookmark.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

export function useUpdateBookmarkTags(
  ...opts: Parameters<typeof api.bookmarks.updateTags.useMutation>
) {
  const apiUtils = api.useUtils();
  return api.bookmarks.updateTags.useMutation({
    ...opts[0],
    onSuccess: (res, req, meta) => {
      apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: req.bookmarkId });

      [...res.attached, ...res.detached].forEach((id) => {
        apiUtils.tags.get.invalidate({ tagId: id });
        apiUtils.bookmarks.getBookmarks.invalidate({ tagId: id });
      });
      apiUtils.tags.list.invalidate();
      apiUtils.lists.stats.invalidate();
      return opts[0]?.onSuccess?.(res, req, meta);
    },
  });
}

/**
 * Checks the grid query context to know if we need to augment the bookmark post creation to fit the grid context
 */
export function useBookmarkPostCreationHook() {
  const gridQueryCtx = useBookmarkGridContext();
  const { mutateAsync: updateBookmark } = useUpdateBookmark();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();

  return async (bookmarkId: string) => {
    if (!gridQueryCtx) {
      return;
    }

    const promises = [];
    if (gridQueryCtx.favourited ?? gridQueryCtx.archived) {
      promises.push(
        updateBookmark({
          bookmarkId,
          favourited: gridQueryCtx.favourited,
          archived: gridQueryCtx.archived,
        }),
      );
    }

    if (gridQueryCtx.listId) {
      promises.push(
        addToList({
          bookmarkId,
          listId: gridQueryCtx.listId,
        }),
      );
    }

    if (gridQueryCtx.tagId) {
      promises.push(
        updateTags({
          bookmarkId,
          attach: [{ tagId: gridQueryCtx.tagId }],
          detach: [],
        }),
      );
    }

    return Promise.all(promises);
  };
}
