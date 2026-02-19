/**
 * @module video
 * @description
 * Utilities for managing sign language video playback, including loading, starting, stopping, and UI container management.
 */
import { state, setState } from './state.js';

/**
 * Stops the sign language video, hides the container, and updates state.
 */
export const stopSLVideo = () => {
    const videoContainer = document.getElementById('sign-language-video');
    const video = state.videoElement;
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
    videoContainer.classList.add('hidden');
    setState('videoPlaying', false);
};

/**
 * Starts the sign language video for the current page.
 * Removes any existing video, loads the new video, and attempts playback.
 * Handles errors and updates state/UI accordingly.
 */
export const startSLVideo = () => {
    const videoContainer = document.getElementById('sign-language-video');

    // Remove the existing video element if it exists
    const existingVideo = videoContainer.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }

    if (!state.videoSource) {
        return;
    }
    const currentLanguage = state.currentLanguage || 'es';
    const videoUrl = `content/i18n/${currentLanguage}/video/${state.videoSource}`;
    // const videoUrl = state.videoSource;
    // Use loadSLVideoWithPromise to load the video
    loadSLVideoWithPromise(videoUrl)
        .then((video) => {
            // Append the new video element to the container
            videoContainer.appendChild(video);

            // Attempt to play the video
            video.play()
                .then(() => {
                    // Video is playing successfully
                    videoContainer.classList.remove('hidden');
                    setState('videoPlaying', true);
                })
                .catch((error) => {
                    // Handle play() error
                    console.warn('Video playback failed:', error);
                });
        })
        .catch((error) => {
            console.error('Failed to start the video:', error);
        });
};

/**
 * Loads a sign language video and returns a promise that resolves with the video element when loaded.
 * Falls back to a default video if the source fails to load.
 * @param {string} src - The source URL of the video.
 * @returns {Promise<HTMLVideoElement>} Resolves with the video element when loaded.
 */
export const loadSLVideoWithPromise = (src) => {
    return new Promise((resolve, reject) => {
        // Create a new video element
        const video = document.createElement('video');
        video.src = src;
        video.controls = true;
        video.autoplay = true;

        // Add the specified classes
        video.classList.add('w-full', 'h-full', 'object-cover');

        // Update the state with the new video element
        setState('videoElement', video);

        // Handle video events
        video.onloadeddata = () => {
            resolve(video); // Resolve the promise with the video element when loaded
        };

        video.onerror = () => {
            console.warn(`Error loading video: ${src}. Falling back to default video.`);
            video.src = "content/i18n/es/video/10_0.mp4"; // Set the default video source
            video.load(); // Reload the video with the new source

            // Handle the fallback video loading
            video.onloadeddata = () => {
                resolve(video); // Resolve the promise with the fallback video
            };

            video.onerror = (error) => {
                console.error('Error loading fallback video:', error);
                reject(error); // Reject the promise if the fallback video also fails
            };
        };
    });
};

/**
 * Loads the current sign language video source for the current page from state.
 * Updates state.videoSource based on the current page.
 */
export const loadCurrentSLVideo = () => {
    const videoFiles = state.videoFiles;
    const currentPage = state.currentPage.replace(/_/g, '-');
    state.videoSource = videoFiles["video-" + currentPage];
}

/**
 * Creates or removes the bottom container for sign language video.
 * Moves the video container into the bottom container when shown, and restores it when hidden.
 * Adjusts body padding to prevent content from being hidden.
 * @param {boolean} show - Whether to show (true) or hide (false) the bottom container.
 */
export const toggleBottomContainer = (show) => {
    const existingContainer = document.getElementById('sign-language-bottom-container');
    const videoContainer = document.getElementById('sign-language-video');

    if (show) {
        // Create the container if it doesn't exist
        if (!existingContainer) {
            const container = document.createElement('div');
            container.id = 'sign-language-bottom-container';
            // Use Tailwind classes for styling
            container.className = [
                'fixed',
                'bottom-0',
                'left-0',
                'z-40',
                'w-full',
                'flex',
                'justify-center',
                'items-center',
                'h-72', // or 'h-[300px]' if your Tailwind config allows arbitrary values
            ].join(' ');

            // Move the existing video container into this one if needed
            if (videoContainer) {
                container.appendChild(videoContainer);
                // Ensure the video container is visible
                videoContainer.classList.remove('hidden');
            } else {
                const newVideoContainer = document.createElement('div');
                newVideoContainer.id = 'sign-language-video';
                newVideoContainer.className = 'w-full h-full';
                container.appendChild(newVideoContainer);
            }

            document.body.appendChild(container);

            // Add Tailwind padding class to body
            document.body.classList.add('pb-72');
        } else if (videoContainer) {
            // Ensure the video container is visible if already in the container
            videoContainer.classList.remove('hidden');
        }
    } else {
        // Remove the container if it exists
        if (existingContainer) {
            // Move the video container back to its original location if needed
            if (videoContainer) {
                document.body.appendChild(videoContainer);
                // Hide the video container
                videoContainer.classList.add('hidden');
            }
            existingContainer.remove();
            document.body.classList.remove('pb-72');
        }
    }
};