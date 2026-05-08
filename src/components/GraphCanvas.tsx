
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink } from '../types';

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId: string | null;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ nodes, links, onNodeClick, selectedNodeId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Arrowhead definition
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#4b5563')
      .style('stroke', 'none');

    // Zoom setup
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Forces
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => {
          const sNode = nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
          const tNode = nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
          return sNode?.cluster === tNode?.cluster ? 80 : 220;
        }))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(d => (d as GraphNode).size + 25))
      .force('cluster', (alpha: number) => {
        const centroids: Record<string, { x: number, y: number, count: number }> = {};
        nodes.forEach(n => {
          if (!n.cluster) return;
          if (!centroids[n.cluster]) centroids[n.cluster] = { x: 0, y: 0, count: 0 };
          centroids[n.cluster].x += n.x || 0;
          centroids[n.cluster].y += n.y || 0;
          centroids[n.cluster].count++;
        });

        nodes.forEach(n => {
          if (!n.cluster || !centroids[n.cluster]) return;
          const c = centroids[n.cluster];
          const cx = c.x / c.count;
          const cy = c.y / c.count;
          n.vx = (n.vx || 0) + (cx - (n.x || 0)) * alpha * 0.15;
          n.vy = (n.vy || 0) + (cy - (n.y || 0)) * alpha * 0.15;
        });
      });

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#374151')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3)
      .attr('marker-end', 'url(#arrowhead)');

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on('drag', (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on('end', (event) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }) as any);

    // Node Circles
    node.append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => getFillColor(d.group))
      .attr('stroke', d => d.id === selectedNodeId ? '#6366f1' : '#111827')
      .attr('stroke-width', d => d.id === selectedNodeId ? 3 : 2)
      .style('filter', d => d.id === selectedNodeId ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.6))' : 'none');

    // Importance Aura (for highly connected nodes)
    node.filter(d => d.data.importance > 5)
      .append('circle')
      .attr('r', d => d.size + 4)
      .attr('fill', 'none')
      .attr('stroke', d => getFillColor(d.group))
      .attr('stroke-opacity', 0.2)
      .attr('stroke-width', 1)
      .attr('class', 'animate-pulse');

    // Labels
    node.append('text')
      .attr('dy', d => d.size + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.id === selectedNodeId ? '#fff' : '#9ca3af')
      .attr('font-size', '10px')
      .attr('font-weight', d => d.id === selectedNodeId ? 'bold' : 'normal')
      .attr('font-family', 'var(--font-mono)')
      .text(d => d.label)
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)');

    // Interaction Effects: Highlight connected edges
    const updateHighlights = () => {
      if (!selectedNodeId) {
        link.attr('stroke', '#374151').attr('stroke-opacity', 0.3).attr('stroke-width', 1);
        node.attr('opacity', 1);
        return;
      }

      const connectedNodes = new Set<string>([selectedNodeId]);
      links.forEach(l => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (sId === selectedNodeId) connectedNodes.add(tId);
        if (tId === selectedNodeId) connectedNodes.add(sId);
      });

      link.each(function(l: any) {
        const sId = l.source.id;
        const tId = l.target.id;
        const isConnected = sId === selectedNodeId || tId === selectedNodeId;
        d3.select(this)
          .transition().duration(200)
          .attr('stroke', isConnected ? '#6366f1' : '#1f2937')
          .attr('stroke-opacity', isConnected ? 0.8 : 0.1)
          .attr('stroke-width', isConnected ? 2 : 1);
      });

      node.transition().duration(200)
        .attr('opacity', (d: any) => connectedNodes.has(d.id) ? 1 : 0.2);
    };

    updateHighlights();

    // Cluster labels group
    const clusterLabelGroup = g.append('g').attr('class', 'cluster-labels');
    
    simulation.on('tick', () => {
      // Update links
      link
        .attr('x1', (d: any) => d.source.x!)
        .attr('y1', (d: any) => d.source.y!)
        .attr('x2', (d: any) => d.target.x!)
        .attr('y2', (d: any) => d.target.y!);

      // Update nodes
      node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);

      // Update cluster labels
      const centroids: Record<string, { x: number, y: number, count: number }> = {};
      nodes.forEach(n => {
        if (!n.cluster) return;
        if (!centroids[n.cluster]) centroids[n.cluster] = { x: 0, y: 0, count: 0 };
        centroids[n.cluster].x += n.x || 0;
        centroids[n.cluster].y += n.y || 0;
        centroids[n.cluster].count++;
      });
      
      const clusterData = Object.entries(centroids).map(([name, c]) => ({
        name,
        x: c.x / c.count,
        y: (c.y / c.count) - 60
      })).filter(c => c.name !== 'root');
      
      const labels = clusterLabelGroup.selectAll<SVGTextElement, any>('text')
        .data(clusterData, d => d.name);
        
      labels.enter().append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', '#4b5563')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('font-family', 'var(--font-display)')
        .attr('opacity', 0.4)
        .attr('pointer-events', 'none')
        .merge(labels as any)
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .text(d => d.name);

      labels.exit().remove();
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, selectedNodeId, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full h-full bg-brand-bg relative overflow-hidden select-none">
      <svg ref={svgRef} width="100%" height="100%" className="w-full h-full" />
    </div>
  );
};

function getFillColor(ext: string) {
  const colors: Record<string, string> = {
    '.js': '#f59e0b',
    '.jsx': '#f59e0b',
    '.ts': '#3b82f6',
    '.tsx': '#3b82f6',
    '.py': '#10b981',
    '.html': '#ec4899',
    '.css': '#06b6d4',
    '.json': '#8b5cf6',
  };
  return colors[ext] || '#6366f1';
}
