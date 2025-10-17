import React from 'react';
import VideoPage from './VideoPage'; // Import the new reusable component

function LeadersVideosPage() {
    return (
        <VideoPage 
            pageTitle="Leaders' Videos" 
            videoType="leaders" 
        />
    );
}

export default LeadersVideosPage;