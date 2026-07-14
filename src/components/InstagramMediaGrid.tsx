import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstagramMedia } from '@/hooks/useApi';
import { ExternalLink, Heart, MessageCircle, Share2, Bookmark, Eye, BarChart3 } from 'lucide-react';

const MEDIA_ICONS: Record<string, string> = {
  IMAGE: '📷',
  VIDEO: '🎬',
  CAROUSEL_ALBUM: '📱',
  REELS: '🎥',
  STORY: '📖',
};

function truncate(text: string, len: number) {
  return text.length > len ? text.slice(0, len) + '…' : text;
}

export function InstagramMediaGrid() {
  const { data, isLoading, isError } = useInstagramMedia(20);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.length) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No Instagram media yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Posts</CardTitle>
        <CardDescription>
          {data.length} most recent media items with engagement metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((post) => (
            <div
              key={post.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
            >
              {/* Thumbnail placeholder */}
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-lg">
                {MEDIA_ICONS[post.media_type] ?? '📄'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {post.media_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.timestamp).toLocaleDateString('en-NZ', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {post.caption && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
                    {truncate(post.caption, 120)}
                  </p>
                )}
                {/* Metrics */}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  {post.likes != null && (
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3 text-red-400" />
                      {post.likes.toLocaleString()}
                    </span>
                  )}
                  {post.comments != null && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {post.comments.toLocaleString()}
                    </span>
                  )}
                  {post.reach != null && (
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3 text-sky-400" />
                      {post.reach.toLocaleString()}
                    </span>
                  )}
                  {post.shares != null && (
                    <span className="inline-flex items-center gap-1">
                      <Share2 className="h-3 w-3" />
                      {post.shares.toLocaleString()}
                    </span>
                  )}
                  {post.saved != null && (
                    <span className="inline-flex items-center gap-1">
                      <Bookmark className="h-3 w-3 text-amber-400" />
                      {post.saved.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
