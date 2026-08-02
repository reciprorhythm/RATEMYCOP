import csv
import sys

def filter_csv(input_file, output_file, search_word, case_sensitive=False):
    """
    Filter a CSV file for records containing a specific word and save to a new CSV.
    
    Args:
        input_file (str): Path to the input CSV file
        output_file (str): Path to save the filtered CSV file
        search_word (str): Word to search for in the records
        case_sensitive (bool): Whether the search should be case sensitive
    """
    try:
        # Open input and output files
        with open(input_file, 'r', encoding='utf-8') as infile, \
             open(output_file, 'w', encoding='utf-8', newline='') as outfile:
            
            # Create CSV reader and writer
            reader = csv.reader(infile)
            writer = csv.writer(outfile)
            
            # Get header row
            header = next(reader)
            writer.writerow(header)
            
            # Counter for matching records
            match_count = 0
            
            # Process each row
            for row in reader:
                # Convert row to string for searching
                row_str = ' '.join(str(cell) for cell in row)
                
                # Perform search based on case sensitivity setting
                if case_sensitive:
                    if search_word in row_str:
                        writer.writerow(row)
                        match_count += 1
                else:
                    if search_word.lower() in row_str.lower():
                        writer.writerow(row)
                        match_count += 1
            
            print(f"Found {match_count} matching records")
            print(f"Results saved to {output_file}")
            
    except FileNotFoundError:
        print(f"Error: Could not find input file '{input_file}'")
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    # Check if correct number of arguments provided
    if len(sys.argv) < 4:
        print("Usage: python filter_csv.py input_file.csv output_file.csv search_word [case_sensitive]")
        print("Example: python filter_csv.py data.csv filtered.csv police")
        print("For case-sensitive search: python filter_csv.py data.csv filtered.csv Police true")
        sys.exit(1)
    
    # Get arguments
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    search_word = sys.argv[3]
    case_sensitive = len(sys.argv) > 4 and sys.argv[4].lower() == 'true'
    
    # Run the filter
    filter_csv(input_file, output_file, search_word, case_sensitive) 