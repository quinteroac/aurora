export type NarratorTokenFrame = {
  type: "token";
  content: string;
};

export type NarratorSceneImageFrame = {
  type: "scene_image";
  url?: string;
  image_b64?: string;
};

export type NarratorDoneFrame = {
  type: "done";
};

export type NarratorFrame =
  | NarratorTokenFrame
  | NarratorSceneImageFrame
  | NarratorDoneFrame;

