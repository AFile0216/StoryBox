import { create } from 'zustand';

interface ImageViewerState {
  imageViewer: {
    isOpen: boolean;
    currentImageUrl: string | null;
    imageList: string[];
    currentIndex: number;
  };
  openImageViewer: (imageUrl: string, imageList?: string[]) => void;
  closeImageViewer: () => void;
  navigateImageViewer: (direction: 'prev' | 'next') => void;
}

const INITIAL_IMAGE_VIEWER_STATE = {
  isOpen: false,
  currentImageUrl: null,
  imageList: [],
  currentIndex: 0,
};

export const useImageViewerStore = create<ImageViewerState>((set) => ({
  imageViewer: INITIAL_IMAGE_VIEWER_STATE,

  openImageViewer: (imageUrl, imageList = []) => {
    const sanitizedList = imageList.length > 0 ? imageList : [imageUrl];
    const currentIndex = sanitizedList.indexOf(imageUrl);
    set({
      imageViewer: {
        isOpen: true,
        currentImageUrl: imageUrl,
        imageList: sanitizedList,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
      },
    });
  },

  closeImageViewer: () => {
    set({
      imageViewer: INITIAL_IMAGE_VIEWER_STATE,
    });
  },

  navigateImageViewer: (direction) => {
    set((state) => {
      const { currentIndex, imageList } = state.imageViewer;
      if (imageList.length === 0) {
        return state;
      }
      if (direction === 'prev') {
        if (currentIndex <= 0) {
          return state;
        }
        const previousIndex = currentIndex - 1;
        return {
          imageViewer: {
            ...state.imageViewer,
            currentIndex: previousIndex,
            currentImageUrl: imageList[previousIndex],
          },
        };
      }
      if (currentIndex >= imageList.length - 1) {
        return state;
      }
      const nextIndex = currentIndex + 1;
      return {
        imageViewer: {
          ...state.imageViewer,
          currentIndex: nextIndex,
          currentImageUrl: imageList[nextIndex],
        },
      };
    });
  },
}));
