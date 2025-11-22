export interface VideoInterval {
  id: string;
  userId: string;
  videoId: string;
  startTime: number;
  endTime: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntervalInput {
  startTime: number;
  endTime: number;
}

export interface IntervalFormData {
  startMinutes: string;
  startSeconds: string;
  endMinutes: string;
  endSeconds: string;
}
