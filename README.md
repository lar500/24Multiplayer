# 24 Game: Math Puzzle Challenge

A web application for playing the classic 24 game with multiplayer and singleplayer modes. The 24 game is a mathematical puzzle where players are given 4 numbers between 1-13 and must use basic operations (addition, subtraction, multiplication, division) to make the number 24.

## Features

- **Game Solver**: Input any four numbers and find all possible solutions to make 24
- **Singleplayer Mode**: Challenge yourself to solve as many 24 puzzles as you can
- **Multiplayer Mode**: Compete with friends in real-time to solve puzzles the fastest
- **Responsive Design**: Works on desktop and mobile devices

## How to Play

1. **Singleplayer Mode**:
   - Solve puzzles as quickly as possible
   - Use each number exactly once
   - Use +, -, *, / operations to make 24
   - Score increases with each correct solution

2. **Multiplayer Mode**:
   - Create a room or join an existing one
   - Compete with other players in real-time
   - First to solve each puzzle gets a point
   - Race to the highest score

3. **Solver**:
   - Enter any four numbers
   - The solver will find all possible solutions
   - Use this to check if a puzzle is solvable or to practice

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Real-time Communication**: Socket.IO
- **Styling**: Tailwind CSS

## Algorithms

The 24 game solver uses a recursive approach to find all possible expressions that evaluate to 24. It:

1. Generates all permutations of the four numbers
2. For each permutation, tries all possible combinations of operations
3. Evaluates each expression and checks if it equals 24

## License

This project is licensed under the MIT License - see the LICENSE file for details.
